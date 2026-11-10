console.log('[BRIDGE] Installed')

// ==========================================
// 1. Read frame date
// ==========================================
function readFrameData() {
    const frameInput = document.querySelector('input.w-10.rounded-md')

    // Fint object count, ex: "Objects (38/38)"
    const objectElement = [...document.querySelectorAll('span')].find((el) =>
        /^Objects\s*\(\d+\/\d+\)$/.test(el.textContent.trim())
    )

    if (!frameInput || !objectElement) {
        console.warn('[BRIDGE] Cannot find frame information')
        return null
    }

    const frameId = Number(frameInput.value)
    const totalFrames = readTotalFrame()
    const objectMatch = objectElement.textContent.trim().match(/Objects\s*\((\d+)\/(\d+)\)/)

    if (
        !Number.isInteger(frameId) ||
        frameId < 0 ||
        !Number.isInteger(totalFrames) ||
        totalFrames <= 0 ||
        !objectMatch
    ) {
        console.warn('[BRIDGE] Invalid frame data')
        return null
    }

    return {
        frameId,
        totalFrames,
        annotationCount: Number(objectMatch[2])
    }
}

function readTotalFrame() {
    const frameInput = document.querySelector('input.w-10.rounded-md')
    const frameContainer = frameInput?.parentElement
    const totalSpan = frameContainer?.querySelector('span')
    const totalMatch = totalSpan?.textContent.trim().match(/^\/\s*(\d+)$/)

    return Number(totalMatch[1]) ?? 20
}

// ==========================================
// 2. Send data frame to background.js
// ==========================================
function saveCurrentFrame(frameData = readFrameData()) {
    if (!frameData) return

    chrome.runtime.sendMessage(
        {
            type: 'SAVE_FRAME_STAT',
            ...frameData
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('[BRIDGE] Save error:', chrome.runtime.lastError.message)
                return
            }

            console.log('[BRIDGE] Saved:', response)
        }
    )
}

// ==========================================
// 3. Handle click Next / Prev / SAVE FRAME
// ==========================================
document.addEventListener(
    'click',
    (event) => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement

        const button = target?.closest('button')
        if (!button) return

        const isNext = button.querySelector('svg.lucide-chevron-right')
        const isPrev = button.querySelector('svg.lucide-chevron-left')
        const isSave = button.querySelector('svg.lucide-save')

        if (isNext || isPrev || isSave) {
            saveCurrentFrame()
        }
    },
    true
)

// ==========================================
// 4. Receive Task ID from page-hook.js
// ==========================================
window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (event.origin !== location.origin) return

    const message = event.data
    if (message?.source !== 'ANNOTATION_TRACKER' || message?.type !== 'TASK_CAPTURED') return

    chrome.runtime.sendMessage({
        type: 'TASK_CAPTURED',
        sequenceId: message.sequenceId,
        taskId: message.taskId,
        totalFrames: readTotalFrame()
    })
})
