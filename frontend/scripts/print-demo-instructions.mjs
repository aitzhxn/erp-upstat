const apiTarget = process.env.VITE_PREVIEW_API_TARGET || 'http://127.0.0.1:3001'

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Enterprise Admin Portal — demo (Ngrok)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  The preview server will listen on:  http://127.0.0.1:3000
  /api is proxied to:                  ${apiTarget}
  (set VITE_PREVIEW_API_TARGET to change the backend target)

  1) After Vite prints "Local: http://127.0.0.1:3000/", keep this terminal open.

  2) In a NEW terminal, expose port 3000 with Ngrok:

       ngrok http 3000

     (or:  ngrok http http://127.0.0.1:3000 )

  3) Open the HTTPS forwarding URL from Ngrok (e.g. https://xxxx.ngrok-free.app)
     in the browser and share it with your client.

  4) Keep the backend API running and reachable at the proxy target so
     Organization Chart, Statistics, Communication (chat), and other /api
     routes work. Default: backend on port 3001 on this machine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
