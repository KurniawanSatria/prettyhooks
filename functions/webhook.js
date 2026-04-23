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

export const handler = async (event, context) => {
  const responsePromise = Promise.resolve({
    statusCode: 202,
    body: JSON.stringify({ message: 'Webhook diterima, diproses di background' })
  });

  (async () => {
    try {
      let rawBody = event.body;
      if (event.isBase64Encoded) {
        rawBody = Buffer.from(event.body, 'base64').toString('utf8');
      }
      const payload = JSON.parse(rawBody);

      const pathParts = event.path.split('/').filter(p => p !== '');
      const functionName = 'discord-webhook-background';
      const funcIndex = pathParts.findIndex(part => part === functionName);
      if (funcIndex === -1) {
        console.error(`Function name '${functionName}' not found in path`);
        return;
      }
      const hookSegments = pathParts.slice(funcIndex + 1);
      if (hookSegments.length === 0) {
        console.error('No hook segments found (ID and token)');
        return;
      }
      const hook = hookSegments.join('/');
      
      if (!hook || hook.length > 300) {
        console.error('Invalid hook parameter');
        return;
      }

      const webhookUrl = `https://discord.com/api/webhooks/${encodeURIComponent(hook)}?with_components=true`;
      console.log(`🔗 Mengirim ke Discord dengan hook: ${hook}`);

      const embedData = buildDiscordEmbed(payload);
      await sendToDiscord(webhookUrl, embedData);

      console.log(`✅ Notifikasi terkirim untuk ${payload.repository?.full_name}`);
    } catch (err) {
      console.error('❌ Gagal memproses webhook:', err.message);
    }
  })();

  return responsePromise;
};