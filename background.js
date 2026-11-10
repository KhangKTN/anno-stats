console.log('[BACKGROUND] Service worker loaded')

// ==========================================
// 0. QUEUE WHITE TASK DATA
// Minimize conflicts caused by multiple write operations on the same Task
// ==========================================
const taskWriteQueues = new Map()

function enqueueTaskWrite(taskId, operation) {
    const previous = taskWriteQueues.get(taskId) || Promise.resolve()

    const current = previous.catch(() => undefined).then(operation)

    taskWriteQueues.set(taskId, current)

    return current.finally(() => {
        if (taskWriteQueues.get(taskId) === current) {
            taskWriteQueues.delete(taskId)
        }
    })
}

// ==========================================
// 1. PROCESS MESSAGE FROM BRIDGE.JS
// ==========================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id

    // ==========================================
    // 2. TASK_CAPTURED
    // Captured Task ID after upload JSON
    // ==========================================
    if (message?.type === 'TASK_CAPTURED') {
        if (tabId === undefined || !message.taskId || typeof message.taskId !== 'string') {
            sendResponse({
                success: false,
                error: 'Invalid tabId or taskId'
            })

            return
        }

        const { taskId, sequenceId, totalFrames } = { ...message }
        const sessionKey = `task:${tabId}`

        enqueueTaskWrite(taskId, async () => {
            const now = new Date().toISOString()

            // Lưu Task ID theo từng tab
            await chrome.storage.session.set({
                [sessionKey]: {
                    taskId,
                    sequenceId,
                    capturedAt: Date.now()
                }
            })

            // Kiểm tra Task đã tồn tại trong storage chưa
            const oldData = await chrome.storage.local.get(taskId)
            const previous = oldData[taskId]

            if (previous) return

            // Khởi tạo Task mới
            const taskRecord = {
                taskId,
                sequenceId,
                totalFrames: Number(totalFrames),
                frames: [],
                createdAt: now,
                updatedAt: now
            }

            await chrome.storage.local.set({
                [taskId]: taskRecord
            })

            console.log('[BACKGROUND] New Task initialized:', taskRecord)

            return taskRecord
        })
            .then((taskRecord) => {
                sendResponse({
                    success: true,
                    tabId,
                    taskId,
                    record: taskRecord
                })
            })
            .catch((error) => {
                console.error('[BACKGROUND] TASK_CAPTURED error:', error)

                sendResponse({
                    success: false,
                    error: error.message
                })
            })

        return true
    }

    // ==========================================
    // 3. SAVE_FRAME_STAT
    // Save or update frame data
    // ==========================================
    if (message?.type === 'SAVE_FRAME_STAT') {
        if (tabId === undefined) {
            sendResponse({
                success: false,
                error: 'Invalid tabId'
            })

            return
        }

        const frameId = Number(message.frameId)
        const totalFrames = Number(message.totalFrames)
        const annotationCount = Number(message.annotationCount)

        // const totalCount =
        //     message.totalCount === undefined || message.totalCount === null ? null : Number(message.totalCount)

        // --------------------------------------
        // Validate input
        // --------------------------------------
        if (
            !Number.isInteger(frameId) ||
            frameId < 0 ||
            !Number.isInteger(totalFrames) ||
            totalFrames <= 0 ||
            !Number.isInteger(annotationCount) ||
            annotationCount < 0
        ) {
            sendResponse({
                success: false,
                error: 'Invalid frame data'
            })

            return
        }

        const sessionKey = `task:${tabId}`

        console.log('[BACKGROUND] Received SAVE_FRAME_STAT:', {
            tabId,
            frameId,
            totalFrames,
            annotationCount
        })

        // --------------------------------------
        // Get Task ID corresponding to tab
        // --------------------------------------
        chrome.storage.session
            .get(sessionKey)
            .then(async (result) => {
                const session = result[sessionKey]

                if (!session?.taskId) {
                    throw new Error('Task ID not found for this tab')
                }

                return enqueueTaskWrite(session.taskId, async () => {
                    const taskId = session.taskId
                    const now = new Date().toISOString()

                    // --------------------------------------
                    // Get current Task
                    // --------------------------------------
                    const oldData = await chrome.storage.local.get(taskId)
                    const previous = oldData[taskId]

                    if (!previous) {
                        throw new Error(`Task record not found: ${taskId}`)
                    }

                    const frames = Array.isArray(previous.frames) ? [...previous.frames] : []

                    const frameRecord = {
                        frameId,
                        annotationCount
                    }

                    // --------------------------------------
                    // Find exist frame
                    // --------------------------------------
                    const frameIndex = frames.findIndex((frame) => frame.frameId === frameId)

                    if (frameIndex !== -1) {
                        frames[frameIndex] = {
                            ...frames[frameIndex],
                            ...frameRecord
                        }
                        console.log('[BACKGROUND] Frame updated:', frameId)
                    } else {
                        // Frame chưa tồn tại: thêm mới
                        frames.push(frameRecord)
                        console.log('[BACKGROUND] New frame added:', frameId)
                    }

                    // frames.sort((a, b) => a.frameId - b.frameId)

                    // --------------------------------------
                    // Update data Task
                    // --------------------------------------
                    const taskRecord = {
                        ...previous,
                        taskId,
                        sequenceId: previous.sequenceId ?? session.sequenceId ?? null,
                        totalFrames,
                        frames,
                        createdAt: previous.createdAt ?? now,
                        updatedAt: now
                    }

                    // --------------------------------------
                    // Save Task  to local
                    // --------------------------------------
                    await chrome.storage.local.set({
                        [taskId]: taskRecord
                    })

                    console.log('[BACKGROUND] Task saved successfully:', taskRecord)

                    return {
                        taskId,
                        frameId,
                        record: taskRecord
                    }
                })
            })

            .then((result) => {
                sendResponse({
                    success: true,
                    taskId: result.taskId,
                    frameId: result.frameId,
                    record: result.record
                })
            })

            .catch((error) => {
                console.error('[BACKGROUND] SAVE_FRAME_STAT error:', error)

                sendResponse({
                    success: false,
                    error: error.message
                })
            })

        return true
    }
})
