import crypto from 'crypto';

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;



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
  const responsePromise = Promise.resolve({
    statusCode: 202,
    body: JSON.stringify({ message: 'Webhook diterima, diproses di background' })
  });
  (async () => {
    try {
      // Ambil raw body untuk signature verification
      const rawBody = event.body;
      const payload = JSON.parse(rawBody);
      const pathParts = event.path.split('/');
      const hook = pathParts[pathParts.length - 1];
      if (!hook || hook.includes('/') || hook.length > 200) {
        console.error('Invalid hook parameter');
        return;
      }

      const webhookUrl = `https://discord.com/api/webhooks/${encodeURIComponent(hook)}?with_components=true`;

      const embedData = buildDiscordEmbed(payload);
      await sendToDiscord(webhookUrl, embedData);

      console.log(`✅ Notifikasi terkirim untuk ${payload.repository?.full_name}`);
    } catch (err) {
      console.error('❌ Gagal memproses webhook:', err.message);
    }
  })();

  return responsePromise;
};