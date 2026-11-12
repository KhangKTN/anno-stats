// ==========================================
// DOM ELEMENTS
// ==========================================
const currentTaskLine = document.getElementById('current-task-line')
const currentTaskMeta = document.getElementById('current-task-meta')

const taskTableBody = document.getElementById('task-table-body')
const taskTotal = document.getElementById('task-total')

const lastUpdated = document.getElementById('last-updated')
const refreshButton = document.getElementById('refresh-button')
const themeToggle = document.getElementById('theme-toggle')

// ==========================================
// FORMATTERS
// ==========================================
const numberFormatter = new Intl.NumberFormat('vi-VN')

function formatNumber(value) {
    return numberFormatter.format(value)
}

function formatDate(value) {
    if (!value) return '—'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return '—'
    }

    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Ho_Chi_Minh'
    }).format(date)
}

function calcMoney(objCount) {
    const unitPrice = 450
    return formatNumber(objCount * 450)
}

// ==========================================
// CALCULATE TOTAL OBJECTS
// ==========================================
function getTotalObjects(task) {
    if (!Array.isArray(task.frames)) {
        return 0
    }

    return task.frames.reduce((sum, frame) => {
        const totalObj = Number(frame.annotationCount)

        if (!Number.isFinite(totalObj) || totalObj < 0) {
            return sum
        }

        return sum + totalObj
    }, 0)
}

// ==========================================
// GET CURRENT TASK ID
// Lollow tab is opening
// ==========================================
async function getCurrentTaskId() {
    const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
    })

    const currentTab = tabs[0]

    if (currentTab?.id === undefined) {
        return null
    }

    const sessionKey = `task:${currentTab.id}`
    const result = await chrome.storage.session.get(sessionKey)
    console.log(sessionKey)

    return result[sessionKey]?.taskId ?? null
}

// ==========================================
// CREATE TABLE CELL
// Use textContent to avoid insert HTML from date
// ==========================================
function createCell(value, className = '') {
    const td = document.createElement('td')

    td.className = `px-3 py-3 text-xs text-[#684381] dark:text-[#D2C3DF] ${className}`
    td.textContent = value

    return td
}

// ==========================================
// RENDER TASK TABLE
// ==========================================
function renderTaskTable(tasks) {
    taskTableBody.replaceChildren()

    // Sort last task
    tasks.sort((a, b) => {
        const dateA = Date.parse(a.createdAt || '') || 0
        const dateB = Date.parse(b.createdAt || '') || 0

        return dateB - dateA
    })

    if (tasks.length === 0) {
        const tr = document.createElement('tr')
        const td = document.createElement('td')

        td.colSpan = 4
        td.className = 'px-3 py-10 text-center text-sm text-[#A397AD]'
        td.textContent = 'Chưa có dữ liệu thống kê.'

        tr.appendChild(td)
        taskTableBody.appendChild(tr)

        return
    }

    const fragment = document.createDocumentFragment()
    let allTaskObj = 0

    tasks.forEach((task) => {
        const tr = document.createElement('tr')

        // Row white - gray like macOS
        tr.className = [
            'border-t',
            'border-[#EEEAF1]',
            'dark:border-[#2B3945]',

            'odd:bg-white',
            'even:bg-[#F5F4F6]',

            'dark:odd:bg-[#18232D]',
            'dark:even:bg-[#202D38]',

            'hover:bg-[#F0EAF5]',
            'dark:hover:bg-[#293744]',

            'text-[#684381]',
            'dark:text-[#D2C3DF]',

            'transition-colors',
            'flex',
            'w-full'
        ].join(' ')

        const totalObj = getTotalObjects(task)
        allTaskObj += totalObj

        // Col 1: Task ID
        const taskIdCell = createCell(task.taskId, 'font-semibold truncate w-[27%]')

        // Col 2: Start date
        const dateCell = createCell(formatDate(task.createdAt), 'w-[27%]')

        // Col 3: Sum obj of task
        const objectCell = createCell(formatNumber(totalObj), 'text-right font-semibold tabular-nums w-[20%]')

        // Col 4: Money
        const amountCell = createCell(formatNumber(totalObj * 450), 'text-right font-medium tabular-nums w-[26%]')

        tr.append(taskIdCell, dateCell, objectCell, amountCell)

        fragment.appendChild(tr)
    })

    taskTableBody.appendChild(fragment)

    taskTotal.textContent = `${tasks.length} Task • ${allTaskObj} Obj • ${calcMoney(allTaskObj)} ₫`
}

// ==========================================
// RENDER CURRENT TASK
// ==========================================
function renderCurrentTask(taskId, task) {
    if (!taskId) {
        currentTaskLine.textContent = `Chưa có Task đang làm.`
        currentTaskMeta.textContent = 'Chưa phát hiện Task trong tab hiện tại.'

        return
    }

    if (!task) {
        currentTaskLine.textContent = `${taskId}: 0 Object.`
        currentTaskMeta.textContent = 'Đang chờ dữ liệu frame đầu tiên.'

        return
    }

    const totalObj = getTotalObjects(task)
    const savedFrames = Array.isArray(task.frames) ? task.frames.length : 0
    const totalFrames = Number(task.totalFrames) || 0

    currentTaskLine.textContent = `${taskId}: ${formatNumber(totalObj)} Obj (${formatNumber(totalObj * 450)} ₫)`

    if (totalFrames > 0) {
        currentTaskMeta.textContent = `Đã ghi nhận ${savedFrames}/${totalFrames} frame`
        if (savedFrames === totalFrames) {
            currentTaskMeta.parentElement.querySelector('svg').removeAttribute('hidden')
        }
    } else {
        currentTaskMeta.textContent = `Đã ghi nhận ${savedFrames} frame`
    }
}

// ==========================================
// LOAD DASHBOARD DATA
// ==========================================
async function loadDashboard() {
    try {
        console.log('[POPUP] Loading dashboard...')

        const currentTaskId = await getCurrentTaskId()

        const storageData = await chrome.storage.local.get(null)

        // Get record
        const tasks = Object.entries(storageData)
            .filter(([_, value]) => {
                return (
                    value &&
                    typeof value === 'object' &&
                    typeof value.taskId === 'string' &&
                    Array.isArray(value.frames)
                )
            })
            .map(([key, value]) => ({
                ...value,
                taskId: value.taskId || key
            }))

        const currentTask = currentTaskId ? storageData[currentTaskId] : null

        renderCurrentTask(currentTaskId, currentTask)
        renderTaskTable(tasks)

        // Update refresh time
        lastUpdated.textContent = `Cập nhật: ${new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        }).format(new Date())}`
    } catch (error) {
        console.error('[POPUP] Load error:', error)

        currentTaskLine.textContent = 'Không thể tải dữ liệu.'
        currentTaskMeta.textContent = error.message
    }
}

// ==========================================
// 9. REFRESH BUTTON
// ==========================================
refreshButton.addEventListener('click', () => {
    loadDashboard()
})

// ==========================================
// 10. AUTO REFRESH WHEN STORAGE CHANGES
// ==========================================
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' || areaName === 'session') {
        loadDashboard()
    }
})

// =========================================
// THEME
// =========================================
function setTheme(theme) {
    const isDark = theme === 'dark'

    // Update UI
    document.documentElement.classList.toggle('dark', isDark)

    // Save choice
    localStorage.setItem('theme', theme)

    // Update tooltip
    if (themeToggle) {
        const nextTheme = isDark ? 'Light' : 'Dark'

        themeToggle.title = `Chuyển sang ${nextTheme} Mode`
        themeToggle.setAttribute('aria-label', `Chuyển sang ${nextTheme} Mode`)
    }
}

function initTheme() {
    if (!themeToggle) return

    const savedTheme = localStorage.getItem('theme')
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
    const initialTheme = savedTheme || (systemDark.matches ? 'dark' : 'light')

    console.log(systemDark)

    setTheme(initialTheme)

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark')
        setTheme(isDark ? 'light' : 'dark')
    })
}

// ==========================================
// INITIALIZE
// ==========================================
loadDashboard()
initTheme()
