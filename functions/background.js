import crypto from 'crypto';

// Webhook secret dari GitHub (optional, tapi sangat disarankan)
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

/**
 * Verifikasi signature GitHub (X-Hub-Signature-256)
 */
function verifySignature(payloadRaw, signatureHeader) {
  if (!GITHUB_WEBHOOK_SECRET) return true; // skip jika tidak diset
  if (!signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payloadRaw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(digest));
}

/**
 * Bangun embed Discord dari payload GitHub push event
 */
function buildDiscordEmbed(payload) {
  const repo = payload.repository?.full_name || 'unknown/repo';
  const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
  const pusherName = payload.pusher?.name || payload.sender?.login || 'someone';
  const compareUrl = payload.compare || `https://github.com/${repo}/commits/${branch}`;
  const commits = (payload.commits || []).slice(0, 3);

  const lines = commits.map(c => {
    const shortMsg = c.message.split('\n')[0];
    const author = c.author?.name || 'unknown';
    return `\u001b[0;37m• ${shortMsg} (${author})\u001b[0m`;
  }).join('\n');

  const ansiText = `\u001b[1;34m[ PUSH ]\u001b[0m\n\u001b[0;37m${repo} • ${branch}\u001b[0m\n\n${lines || 'No commit messages'}`;

  return {
    embeds: [
      {
        author: {
          name: pusherName,
          icon_url: `https://github.com/${pusherName}.png`,
          url: `https://github.com/${pusherName}`
        },
        title: repo,
        url: compareUrl,
        color: 0xffffff,
        description: `\`\`\`ansi\n${ansiText}\n\`\`\``,
        timestamp: new Date().toISOString()
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            label: 'Open Repo',
            style: 5,
            url: `https://github.com/${repo}`
          },
          {
            type: 2,
            label: 'View Changes',
            style: 5,
            url: compareUrl
          }
        ]
      }
    ]
  };
}

/**
 * Kirim payload ke Discord dengan timeout 10 detik
 */
async function sendToDiscord(webhookUrl, embedData) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedData),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord error ${res.status}: ${text}`);
    }
    return true;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Handler utama Netlify (background)
 */
export const handler = async (event, context) => {
  // 1. Kirim respons 202 (Accepted) segera ke GitHub
  //    Ini penting agar GitHub tidak mengulang webhook.
  const responsePromise = Promise.resolve({
    statusCode: 202,
    body: JSON.stringify({ message: 'Webhook diterima, diproses di background' })
  });

  // 2. Lakukan processing di background (tidak memblokir response)
  (async () => {
    try {
      // Ambil raw body untuk signature verification
      const rawBody = event.body;
      const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];

      // Verifikasi signature
      if (!verifySignature(rawBody, signature)) {
        console.error('Signature verification failed');
        return;
      }

      // Hanya proses event push
      const githubEvent = event.headers['x-github-event'] || event.headers['X-GitHub-Event'];
      if (githubEvent !== 'push') {
        console.log(`Ignored event: ${githubEvent}`);
        return;
      }

      // Parse payload
      const payload = JSON.parse(rawBody);

      // Ambil hook dari path parameter
      // Path pattern: /.netlify/functions/discord-webhook/:hook
      const pathParts = event.path.split('/');
      const hook = pathParts[pathParts.length - 1]; // ambil segmen terakhir

      if (!hook || hook.includes('/') || hook.length > 200) {
        console.error('Invalid hook parameter');
        return;
      }

      const webhookUrl = `https://discord.com/api/webhooks/${encodeURIComponent(hook)}?with_components=true`;

      // Bangun embed
      const embedData = buildDiscordEmbed(payload);

      // Kirim ke Discord
      await sendToDiscord(webhookUrl, embedData);

      console.log(`✅ Notifikasi terkirim untuk ${payload.repository?.full_name}`);
    } catch (err) {
      console.error('❌ Gagal memproses webhook:', err.message);
    }
  })();

  // 3. Kembalikan response ke GitHub
  return responsePromise;
};