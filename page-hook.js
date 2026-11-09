;(() => {
    if (window.__annotationHookInstalled) return
    window.__annotationHookInstalled = true

    const originalFetch = window.fetch

    window.fetch = async function (...args) {
        const [input] = args

        const url = input instanceof Request ? input.url : String(input)

        // Chỉ bắt API /api/v1/sequences/{id}
        const sequenceId = extractSequenceId(url)

        // Request khác thì xử lý bình thường
        if (!sequenceId) {
            return originalFetch.apply(this, args)
        }

        const response = await originalFetch.apply(this, args)

        if (response.ok) {
            try {
                const data = await response.clone().json()

                // TODO: Điều chỉnh theo cấu trúc Response thực tế
                const taskId = data.payload.sequenceName

                if (taskId) {
                    window.postMessage(
                        {
                            source: 'ANNOTATION_TRACKER',
                            type: 'TASK_CAPTURED',
                            sequenceId,
                            taskId
                        },
                        location.origin
                    )
                }
            } catch (error) {
                console.error('Cannot parse sequence response:', error)
            }
        }

        return response
    }

    function extractSequenceId(url) {
        try {
            const pathname = new URL(url, location.href).pathname
            const match = pathname.match(/^\/api\/v1\/sequences\/([^/]+)\/?$/)

            return match ? decodeURIComponent(match[1]) : null
        } catch {
            return null
        }
    }
})()
