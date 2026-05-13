const STATE = {
  POMODORO: 'pomodoro',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak'
}

const state = {
  mode: STATE.POMODORO,
  timeLeft: 25 * 60,
  totalTime: 25 * 60,
  phase: 'idle', // 'idle' | 'running' | 'paused'
  timerId: null,
  timerStart: null, // Date.now() when timer started, for drift correction
  completedPomodoros: 0,
  sessions: [],
  tasks: [],
  selectedTaskId: null
}

const $ = id => document.getElementById(id)
const timerDisplay = $('timerDisplay')
const timerStatus = $('timerStatus')
const selectedTaskDisplay = $('selectedTaskDisplay')
const btnStart = $('btnStart')
const btnReset = $('btnReset')
const modeTabs = document.querySelectorAll('.mode-tab')
const timerRing = document.querySelector('.timer-ring')
const ringProgress = document.querySelector('.ring-progress')
const completedCount = $('completedCount')
const taskInput = $('taskInput')
const btnAddTask = $('btnAddTask')
const taskList = $('taskList')
const taskCount = $('taskCount')
const chkOntop = $('chkOntop')
const inputPomodoro = $('inputPomodoro')
const inputShortBreak = $('inputShortBreak')
const inputLongBreak = $('inputLongBreak')
const historyOverlay = $('historyOverlay')
const btnHistory = $('btnHistory')
const btnHistoryClose = $('btnHistoryClose')

const CIRCUMFERENCE = 628.32

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getDateStr(d) {
  const date = d || new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function getSettings() {
  return {
    pomodoro: parseInt(inputPomodoro.value) || 25,
    shortBreak: parseInt(inputShortBreak.value) || 5,
    longBreak: parseInt(inputLongBreak.value) || 15
  }
}

function getModeDuration(mode) {
  return getSettings()[mode] * 60
}

function setStartButton(label, isRunning) {
  btnStart.textContent = label
  btnStart.className = 'ctrl-btn primary' + (isRunning ? ' running' : '')
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(state.timeLeft)
  const progress = state.totalTime > 0
    ? (state.timeLeft / state.totalTime) * CIRCUMFERENCE
    : CIRCUMFERENCE
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE - progress
}

function updateTimerRingClass() {
  timerRing.className = 'timer-ring'
  if (state.mode === STATE.SHORT_BREAK) timerRing.classList.add('short-break')
  if (state.mode === STATE.LONG_BREAK) timerRing.classList.add('long-break')
}

function updateStatusText() {
  const labels = {
    [STATE.POMODORO]: '专注时间',
    [STATE.SHORT_BREAK]: '短休息',
    [STATE.LONG_BREAK]: '长休息'
  }
  if (state.phase === 'idle') {
    timerStatus.textContent = '准备就绪'
  } else if (state.phase === 'paused') {
    timerStatus.textContent = '已暂停'
  } else {
    timerStatus.textContent = labels[state.mode]
  }
}

function updateSelectedTaskDisplay() {
  if (state.selectedTaskId) {
    const task = state.tasks.find(t => t.id === state.selectedTaskId)
    if (task) {
      selectedTaskDisplay.textContent = `📌 ${task.text}`
      return
    }
  }
  selectedTaskDisplay.textContent = ''
}

function updateModeTabs() {
  modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === state.mode))
}

modeTabs.forEach(tab => tab.addEventListener('click', () => switchMode(tab.dataset.mode)))

function applyBadge() {
  if (state.phase === 'running' && state.mode === STATE.POMODORO) {
    document.title = `🍅 ${formatTime(state.timeLeft)}`
  } else {
    document.title = '番茄钟'
  }
}

function switchMode(mode) {
  stopTimer()
  state.mode = mode
  state.totalTime = getModeDuration(mode)
  state.timeLeft = state.totalTime
  state.phase = 'idle'
  updateTimerRingClass()
  updateDisplay()
  updateStatusText()
  updateModeTabs()
  setStartButton('开始', false)
}

function tick() {
  if (state.phase !== 'running') return

  const elapsed = Math.floor((Date.now() - state.timerStart) / 1000)
  state.timeLeft = Math.max(0, state.totalTime - elapsed)
  updateDisplay()
  applyBadge()

  if (state.timeLeft <= 0) {
    stopTimer()
    onTimerComplete()
  } else {
    state.timerId = setTimeout(tick, 200)
  }
}

function onTimerComplete() {
  if (state.mode !== STATE.POMODORO) {
    switchMode(STATE.POMODORO)
    window.electronAPI.sendNotification({
      title: '☕ 休息结束',
      body: '休息时间到，开始新的专注吧！'
    })
    return
  }

  state.completedPomodoros++
  completedCount.textContent = state.completedPomodoros
  saveStats()

  const duration = getSettings().pomodoro
  const selectedTask = state.selectedTaskId
    ? state.tasks.find(t => t.id === state.selectedTaskId)
    : null
  state.sessions.push({
    id: generateId(),
    taskId: selectedTask ? selectedTask.id : null,
    taskName: selectedTask ? selectedTask.text : '（无任务）',
    date: getDateStr(),
    completedAt: Date.now(),
    duration
  })
  saveSessions()

  if (state.completedPomodoros % 4 === 0) {
    switchMode(STATE.LONG_BREAK)
  } else {
    switchMode(STATE.SHORT_BREAK)
  }

  renderTasks()

  window.electronAPI.sendNotification({
    title: '🍅 番茄完成！',
    body: selectedTask
      ? `任务「${selectedTask.text}」完成 1 个番茄`
      : `已完成 ${state.completedPomodoros} 个番茄，该休息一下了。`
  })
}

function startTimer() {
  state.phase = 'running'
  if (!state.timerStart) {
    state.timerStart = Date.now()
  } else {
    // resuming from pause: adjust timerStart so timeLeft stays correct
    state.timerStart = Date.now() - (state.totalTime - state.timeLeft) * 1000
  }
  setStartButton('暂停', true)
  updateStatusText()
  state.timerId = setTimeout(tick, 200)
}

function pauseTimer() {
  state.phase = 'paused'
  state.timerStart = null
  clearTimeout(state.timerId)
  state.timerId = null
  setStartButton('继续', false)
  updateStatusText()
}

function stopTimer() {
  if (state.phase === 'running' || state.phase === 'paused') {
    clearTimeout(state.timerId)
  }
  state.phase = 'idle'
  state.timerStart = null
  state.timerId = null
  setStartButton('开始', false)
  updateStatusText()
}

function resetTimer() {
  stopTimer()
  state.totalTime = getModeDuration(state.mode)
  state.timeLeft = state.totalTime
  updateDisplay()
  applyBadge()
}

btnStart.addEventListener('click', () => {
  if (state.phase === 'running') {
    pauseTimer()
  } else {
    startTimer()
  }
})

btnReset.addEventListener('click', resetTimer)

function onSettingChange() {
  if (state.phase === 'idle') {
    state.totalTime = getModeDuration(state.mode)
    state.timeLeft = state.totalTime
    updateDisplay()
  }
}

;[inputPomodoro, inputShortBreak, inputLongBreak].forEach(el => {
  el.addEventListener('change', () => { onSettingChange(); saveSettings() })
})

chkOntop.addEventListener('change', () => {
  window.electronAPI.setAlwaysOnTop(chkOntop.checked)
})

function computeTaskCounts() {
  const today = getDateStr()
  const counts = {}
  for (const s of state.sessions) {
    if (s.date === today && s.taskId) {
      counts[s.taskId] = (counts[s.taskId] || 0) + 1
    }
  }
  return counts
}

function renderTasks() {
  const counts = computeTaskCounts()
  taskList.innerHTML = ''
  state.tasks.forEach(task => {
    const count = counts[task.id] || 0
    const li = document.createElement('li')
    li.className = 'task-item'
      + (task.done ? ' done' : '')
      + (task.id === state.selectedTaskId ? ' selected' : '')
    li.dataset.taskId = task.id
    li.innerHTML = `
      <div class="task-check" data-id="${task.id}"></div>
      <span class="task-text">${escapeHtml(task.text)}</span>
      ${count > 0 ? `<span class="task-badge">${count}</span>` : ''}
      <button class="task-del" data-id="${task.id}">&times;</button>
    `
    taskList.appendChild(li)
  })
  taskCount.textContent = state.tasks.length
  saveTasks()
  updateSelectedTaskDisplay()
}

function addTask(text) {
  text = text.trim()
  if (!text) return
  state.tasks.push({ id: generateId(), text, done: false })
  renderTasks()
}

function handleAddTask() {
  addTask(taskInput.value)
  taskInput.value = ''
}

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id)
  if (!task) return
  task.done = !task.done
  if (task.done && state.selectedTaskId === id) {
    state.selectedTaskId = null
  }
  renderTasks()
}

function selectTask(id) {
  const task = state.tasks.find(t => t.id === id)
  if (!task || task.done) return
  state.selectedTaskId = state.selectedTaskId === id ? null : id
  renderTasks()
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id)
  if (state.selectedTaskId === id) state.selectedTaskId = null
  renderTasks()
}

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAddTask()
})
btnAddTask.addEventListener('click', handleAddTask)

taskList.addEventListener('click', (e) => {
  const item = e.target.closest('.task-item')
  if (!item) return
  const id = item.dataset.taskId
  if (e.target.closest('.task-check')) {
    toggleTask(id)
  } else if (e.target.closest('.task-del')) {
    deleteTask(id)
  } else {
    selectTask(id)
  }
})

// ===== History =====
function openHistory() {
  const today = getDateStr()
  const month = today.slice(0, 7)

  let todayCount = 0, todayMins = 0, monthCount = 0, monthMins = 0
  const groups = {}

  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i]
    if (s.date === today) { todayCount++; todayMins += s.duration }
    if (s.date.startsWith(month)) { monthCount++; monthMins += s.duration }
    if (!groups[s.date]) groups[s.date] = []
    groups[s.date].push(s)
  }

  $('todayCount').textContent = todayCount
  $('todayMinutes').textContent = todayMins
  $('monthCount').textContent = monthCount
  $('monthMinutes').textContent = monthMins

  const list = $('historyGroupList')
  const dates = Object.keys(groups).sort().reverse()

  if (dates.length === 0) {
    list.innerHTML = '<div class="history-empty">还没有记录，开始一个番茄吧 🍅</div>'
  } else {
    let html = ''
    for (const date of dates) {
      html += `<div class="history-group"><div class="history-group-date">${date}</div>`
      for (const item of groups[date]) {
        const time = new Date(item.completedAt)
        const timeStr = formatTime(time.getHours() * 60 + time.getMinutes())
        html += `<div class="history-item">`
        html += `<span class="history-item-task">${escapeHtml(item.taskName)}</span>`
        html += `<span class="history-item-time">${timeStr} · ${item.duration}分钟</span>`
        html += `</div>`
      }
      html += `</div>`
    }
    list.innerHTML = html
  }

  historyOverlay.classList.add('open')
}

function closeHistory() {
  historyOverlay.classList.remove('open')
}

btnHistory.addEventListener('click', openHistory)
btnHistoryClose.addEventListener('click', closeHistory)
historyOverlay.addEventListener('click', (e) => {
  if (e.target === historyOverlay) closeHistory()
})

// ===== Persistence =====
const STORAGE_KEYS = {
  tasks: 'pomodoro-tasks-v2',
  sessions: 'pomodoro-sessions',
  stats: 'pomodoro-stats',
  settings: 'pomodoro-settings'
}

function saveTasks() {
  try { localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks)) } catch {}
}

function loadTasks() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.tasks)
    if (data) {
      state.tasks = JSON.parse(data)
      state.tasks = state.tasks.map(t => ({ ...t, id: t.id || generateId() }))
    }
  } catch {}
}

function saveSessions() {
  try { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions)) } catch {}
}

function loadSessions() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.sessions)
    if (data) state.sessions = JSON.parse(data)
  } catch {}
}

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify({
      count: state.completedPomodoros,
      date: new Date().toDateString()
    }))
  } catch {}
}

function loadStats() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.stats)
    if (data) {
      const parsed = JSON.parse(data)
      state.completedPomodoros = parsed.date === new Date().toDateString()
        ? (parsed.count || 0) : 0
    }
  } catch {}
  completedCount.textContent = state.completedPomodoros
}

function loadSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings)
    if (data) {
      const s = JSON.parse(data)
      if (s.pomodoro) inputPomodoro.value = s.pomodoro
      if (s.shortBreak) inputShortBreak.value = s.shortBreak
      if (s.longBreak) inputLongBreak.value = s.longBreak
    }
  } catch {}
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(getSettings())) } catch {}
}

$('btn-hide').addEventListener('click', () => window.electronAPI.hide())
$('btn-close').addEventListener('click', () => window.electronAPI.close())

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return
  if (historyOverlay.classList.contains('open')) {
    if (e.key === 'Escape') closeHistory()
    return
  }
  if (e.key === ' ') { e.preventDefault(); btnStart.click() }
  if (e.key === 'r' || e.key === 'R') btnReset.click()
  if (e.key === '1') switchMode(STATE.POMODORO)
  if (e.key === '2') switchMode(STATE.SHORT_BREAK)
  if (e.key === '3') switchMode(STATE.LONG_BREAK)
})

function init() {
  loadSettings()
  loadStats()
  loadSessions()
  loadTasks()
  state.totalTime = getModeDuration(state.mode)
  state.timeLeft = state.totalTime
  updateTimerRingClass()
  updateDisplay()
  updateStatusText()
  updateModeTabs()
  renderTasks()
}

init()
