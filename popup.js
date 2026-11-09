// ==========================================
// 1. DOM ELEMENTS
// ==========================================
const currentTaskLine = document.getElementById('current-task-line')
const currentTaskMeta = document.getElementById('current-task-meta')

const taskTableBody = document.getElementById('task-table-body')
const taskTotal = document.getElementById('task-total')

const lastUpdated = document.getElementById('last-updated')
const refreshButton = document.getElementById('refresh-button')

// ==========================================
// 2. FORMATTERS
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

// ==========================================
// 3. CALCULATE TOTAL OBJECTS
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
// 4. GET CURRENT TASK ID
// Theo tab đang mở
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
// 5. CREATE TABLE CELL
// Dùng textContent để tránh chèn HTML từ dữ liệu
// ==========================================

function createCell(value, className = '') {
    const td = document.createElement('td')

    td.className = `px-3 py-3 text-xs text-[#554463] ${className}`
    td.textContent = value

    return td
}

// ==========================================
// 6. RENDER TASK TABLE
// ==========================================

function renderTaskTable(tasks) {
    taskTableBody.replaceChildren()

    // Sắp xếp Task mới nhất lên đầu
    tasks.sort((a, b) => {
        const dateA = Date.parse(a.createdAt || '') || 0
        const dateB = Date.parse(b.createdAt || '') || 0

        return dateB - dateA
    })

    taskTotal.textContent = `${tasks.length} Task`

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

    tasks.forEach((task) => {
        const tr = document.createElement('tr')

        // Hàng trắng và xám xen kẽ kiểu macOS
        tr.className = [
            'border-t',
            'border-[#EEEAF1]',
            'odd:bg-white',
            'even:bg-[#F5F4F6]',
            'hover:bg-[#F0EAF5]',
            'transition-colors'
        ].join(' ')

        const totalObj = getTotalObjects(task)

        // Cột 1: Task ID
        const taskIdCell = createCell(task.taskId, 'font-semibold text-[#624276] truncate')

        // Cột 2: Ngày bắt đầu
        const dateCell = createCell(formatDate(task.createdAt), 'text-[#84788C]')

        // Cột 3: Tổng Object
        const objectCell = createCell(formatNumber(totalObj), 'text-right font-semibold tabular-nums text-[#624276]')

        // Cột 4: Thành tiền
        const amountCell = createCell(
            formatNumber(totalObj * 450),
            'text-right font-medium tabular-nums text-[#84788C]'
        )

        tr.append(taskIdCell, dateCell, objectCell, amountCell)

        fragment.appendChild(tr)
    })

    taskTableBody.appendChild(fragment)
}

// ==========================================
// 7. RENDER CURRENT TASK
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
    } else {
        currentTaskMeta.textContent = `Đã ghi nhận ${savedFrames} frame`
    }
}

// ==========================================
// 8. LOAD DASHBOARD DATA
// ==========================================

async function loadDashboard() {
    try {
        console.log('[POPUP] Loading dashboard...')

        // Lấy Task ID của tab hiện tại
        const currentTaskId = await getCurrentTaskId()

        // Lấy toàn bộ dữ liệu Task
        const storageData = await chrome.storage.local.get(null)

        // Chỉ lấy các record có cấu trúc Task hợp lệ
        const tasks = Object.entries(storageData)
            .filter(([key, value]) => {
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

        // Tìm Task đang làm
        const currentTask = currentTaskId ? storageData[currentTaskId] : null

        // Hiển thị giao diện
        renderCurrentTask(currentTaskId, currentTask)

        renderTaskTable(tasks)

        // Cập nhật thời gian làm mới
        lastUpdated.textContent = `Cập nhật: ${new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
        }).format(new Date())}`

        console.log('[POPUP] Dashboard loaded:', {
            currentTaskId,
            taskCount: tasks.length
        })
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

// ==========================================
// 11. INITIALIZE
// ==========================================
loadDashboard()
