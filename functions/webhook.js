// ──────────────────────────────────────────────
//  prettyhooks · functions/webhook.js
//  Supports every GitHub webhook event type
// ──────────────────────────────────────────────

const WHITE = 0xffffff;

// Set FOOTER_GIF in your Netlify environment variables.
// Example: https://cdn.example.com/banner.gif
// Leave empty / unset to disable the footer image.
const FOOTER_GIF = process.env.FOOTER_GIF || '';

// ── Helpers ───────────────────────────────────

function avatarUrl(login) {
  return login ? `https://github.com/${login}.png` : undefined;
}

function profileUrl(login) {
  return login ? `https://github.com/${login}` : undefined;
}

/** Truncate a string to `max` chars, appending "…" if cut */
function trunc(str = '', max = 100) {
  str = str.trim();
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Build the standard action button row */
function actionComponents(...buttons) {
  const valid = buttons.filter(Boolean);
  if (!valid.length) return [];
  return [
    {
      type: 1,
      components: valid.map(({ label, url }) => ({
        type: 2,
        style: 5,
        label,
        url: url || 'https://github.com'
      }))
    }
  ];
}

/** Wrap text in an ansi code block */
function ansi(text) {
  return `\`\`\`ansi\n${text}\n\`\`\``;
}

// ── Per-event embed builders ───────────────────

function buildPushEmbed(payload) {
  const repo      = payload.repository?.full_name || 'unknown/repo';
  const branch    = (payload.ref || '').replace('refs/heads/', '') || 'unknown';
  const sender    = payload.pusher?.name || payload.sender?.login || 'someone';
  const compareUrl = payload.compare || `https://github.com/${repo}/commits/${branch}`;
  const commits   = (payload.commits || []).slice(0, 5);

  const fields = commits.map(c => {
    const shortMsg  = c.message.split('\n')[0];
    const bodyLines = c.message.split('\n').slice(1).filter(l => l.trim()).join('\n');
    const modified  = [...(c.added || []), ...(c.modified || []), ...(c.removed || [])];

    const msgBlock = bodyLines
      ? `\u001b[1;36m${trunc(shortMsg, 120)}\n\n${trunc(bodyLines, 300)}\u001b[0m`
      : `\u001b[1;36m${trunc(shortMsg, 200)}\u001b[0m`;

    const result = [
      {
        name: c.id || c.sha || 'commit',
        value: ansi(msgBlock),
        inline: true
      }
    ];

    if (modified.length) {
      result.push({
        name: 'Modified',
        value: ansi(modified.slice(0, 20).map(f => `"${f}"`).join(',\n')),
        inline: false
      });
    }

    return result;
  }).flat();

  if (!fields.length) {
    fields.push({ name: 'Branch', value: `\`${branch}\``, inline: true });
  }

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `${repo} · ${branch}`,
      url: compareUrl,
      color: WHITE,
      fields,
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'Open Repo',    url: `https://github.com/${repo}` },
      { label: 'View Changes', url: compareUrl }
    )
  };
}

function buildPullRequestEmbed(payload) {
  const pr     = payload.pull_request;
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const action = payload.action || 'updated';
  const sender = payload.sender?.login || 'someone';

  const isMerged = action === 'closed' && pr?.merged;
  const color    = isMerged ? 0x9b59b6 : action === 'closed' ? 0xed4245 : 0x57f287;

  const statusLabel = isMerged ? 'Merged' : action.charAt(0).toUpperCase() + action.slice(1);

  const fields = [
    { name: 'Status',  value: `\`${statusLabel}\``,   inline: true  },
    { name: 'Base ← Head', value: `\`${pr?.base?.ref}\` ← \`${pr?.head?.ref}\``, inline: true }
  ];

  if (pr?.body?.trim()) {
    fields.push({ name: 'Description', value: trunc(pr.body, 400), inline: false });
  }

  if (pr?.changed_files != null) {
    fields.push({ name: 'Changes', value: `\`+${pr.additions} -${pr.deletions}\` in ${pr.changed_files} file(s)`, inline: true });
  }

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`#${pr?.number} ${pr?.title || 'Pull Request'}`, 200),
      url: pr?.html_url || `https://github.com/${repo}/pulls`,
      color,
      fields,
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View PR',  url: pr?.html_url },
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildIssuesEmbed(payload) {
  const issue  = payload.issue;
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const action = payload.action || 'updated';
  const sender = payload.sender?.login || 'someone';
  const color  = action === 'closed' ? 0xed4245 : action === 'reopened' ? 0x57f287 : 0xfee75c;

  const fields = [
    { name: 'Status', value: `\`${action}\``, inline: true },
    { name: 'Labels', value: issue?.labels?.length ? issue.labels.map(l => `\`${l.name}\``).join(' ') : '`none`', inline: true }
  ];

  if (issue?.body?.trim()) {
    fields.push({ name: 'Body', value: trunc(issue.body, 400), inline: false });
  }

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`#${issue?.number} ${issue?.title || 'Issue'}`, 200),
      url: issue?.html_url || `https://github.com/${repo}/issues`,
      color,
      fields,
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Issue', url: issue?.html_url },
      { label: 'Open Repo',  url: `https://github.com/${repo}` }
    )
  };
}

function buildIssueCommentEmbed(payload) {
  const issue   = payload.issue;
  const comment = payload.comment;
  const repo    = payload.repository?.full_name || 'unknown/repo';
  const sender  = payload.sender?.login || 'someone';
  const isPR    = !!issue?.pull_request;

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`Comment on ${isPR ? 'PR' : 'Issue'} #${issue?.number}: ${issue?.title || ''}`, 200),
      url: comment?.html_url || `https://github.com/${repo}`,
      color: WHITE,
      fields: [
        { name: 'Comment', value: trunc(comment?.body || '*(empty)*', 800), inline: false }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Comment', url: comment?.html_url },
      { label: 'Open Repo',    url: `https://github.com/${repo}` }
    )
  };
}

function buildCreateDeleteEmbed(payload, eventType) {
  const repo    = payload.repository?.full_name || 'unknown/repo';
  const refType = payload.ref_type || 'ref';
  const ref     = payload.ref || 'unknown';
  const sender  = payload.sender?.login || 'someone';
  const isCreate = eventType === 'create';

  const branchUrl = isCreate
    ? `https://github.com/${repo}/tree/${encodeURIComponent(ref)}`
    : `https://github.com/${repo}`;

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `${isCreate ? '🌱 Created' : '🗑️ Deleted'} ${refType}: ${ref}`,
      url: branchUrl,
      color: isCreate ? 0x57f287 : 0xed4245,
      fields: [
        { name: 'Repository', value: `\`${repo}\``, inline: true },
        { name: 'Ref Type',   value: `\`${refType}\``, inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildReleaseEmbed(payload) {
  const release = payload.release;
  const repo    = payload.repository?.full_name || 'unknown/repo';
  const sender  = payload.sender?.login || 'someone';

  const fields = [
    { name: 'Tag',    value: `\`${release?.tag_name || 'unknown'}\``, inline: true },
    { name: 'Target', value: `\`${release?.target_commitish || 'unknown'}\``, inline: true },
    { name: 'Status', value: release?.prerelease ? '`Pre-release`' : '`Stable`', inline: true }
  ];

  if (release?.body?.trim()) {
    fields.push({ name: 'Release Notes', value: trunc(release.body, 600), inline: false });
  }

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(release?.name || release?.tag_name || 'New Release', 200),
      url: release?.html_url || `https://github.com/${repo}/releases`,
      color: 0xeb459e,
      fields,
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Release', url: release?.html_url },
      { label: 'Open Repo',    url: `https://github.com/${repo}` }
    )
  };
}

function buildStarEmbed(payload) {
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const sender = payload.sender?.login || 'someone';
  const stars  = payload.repository?.stargazers_count ?? '?';
  const action = payload.action;

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `⭐ ${action === 'created' ? 'Starred' : 'Unstarred'} ${repo}`,
      url: `https://github.com/${repo}/stargazers`,
      color: 0xfee75c,
      fields: [
        { name: 'Total Stars', value: `\`${stars}\``, inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildForkEmbed(payload) {
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const forkee = payload.forkee?.full_name || 'unknown/fork';
  const sender = payload.sender?.login || 'someone';
  const forks  = payload.repository?.forks_count ?? '?';

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `🍴 Forked ${repo}`,
      url: `https://github.com/${forkee}`,
      color: 0x5865f2,
      fields: [
        { name: 'Fork',        value: `\`${forkee}\``, inline: true },
        { name: 'Total Forks', value: `\`${forks}\``,  inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Fork', url: `https://github.com/${forkee}` },
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildWorkflowRunEmbed(payload) {
  const run    = payload.workflow_run;
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const sender = payload.sender?.login || 'someone';

  const conclusionColors = {
    success:   0x57f287,
    failure:   0xed4245,
    cancelled: 0x95a5a6,
    skipped:   0x95a5a6,
    timed_out: 0xe67e22
  };

  const color = run?.conclusion
    ? conclusionColors[run.conclusion] || WHITE
    : 0xfee75c; // in_progress = yellow

  const statusLabel = run?.conclusion
    ? run.conclusion.charAt(0).toUpperCase() + run.conclusion.slice(1)
    : (run?.status || 'Running');

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`[${run?.event || 'workflow'}] ${run?.name || 'Workflow Run'}`, 200),
      url: run?.html_url || `https://github.com/${repo}/actions`,
      color,
      fields: [
        { name: 'Status',   value: `\`${statusLabel}\``,           inline: true },
        { name: 'Branch',   value: `\`${run?.head_branch || '?'}\``, inline: true },
        { name: 'Attempt',  value: `\`#${run?.run_attempt || 1}\``,  inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Run',  url: run?.html_url },
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildPullRequestReviewEmbed(payload) {
  const review = payload.review;
  const pr     = payload.pull_request;
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const sender = payload.sender?.login || 'someone';

  const stateColors = {
    approved:          0x57f287,
    changes_requested: 0xed4245,
    commented:         0xfee75c
  };

  const stateLabel = {
    approved:          '✅ Approved',
    changes_requested: '❌ Changes Requested',
    commented:         '💬 Commented'
  };

  const state = review?.state?.toLowerCase() || 'commented';

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`Review on PR #${pr?.number}: ${pr?.title || ''}`, 200),
      url: review?.html_url || `https://github.com/${repo}/pulls`,
      color: stateColors[state] || WHITE,
      fields: [
        { name: 'Decision', value: stateLabel[state] || `\`${state}\``, inline: true },
        ...(review?.body?.trim() ? [{ name: 'Comment', value: trunc(review.body, 600), inline: false }] : [])
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Review', url: review?.html_url },
      { label: 'View PR',     url: pr?.html_url }
    )
  };
}

function buildDeploymentStatusEmbed(payload) {
  const status     = payload.deployment_status;
  const deployment = payload.deployment;
  const repo       = payload.repository?.full_name || 'unknown/repo';
  const sender     = payload.sender?.login || 'someone';

  const stateColors = {
    success:  0x57f287,
    failure:  0xed4245,
    error:    0xed4245,
    pending:  0xfee75c,
    inactive: 0x95a5a6,
    in_progress: 0x5865f2,
    queued:   0x95a5a6
  };

  const state = status?.state || 'unknown';

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `🚀 Deployment ${state}: ${deployment?.environment || 'unknown'}`,
      url: status?.log_url || status?.target_url || `https://github.com/${repo}/deployments`,
      color: stateColors[state] || WHITE,
      fields: [
        { name: 'Environment', value: `\`${deployment?.environment || '?'}\``, inline: true },
        { name: 'State',       value: `\`${state}\``,                          inline: true },
        { name: 'Ref',         value: `\`${deployment?.ref || '?'}\``,          inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Logs', url: status?.log_url || status?.target_url },
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildMemberEmbed(payload) {
  const member = payload.member;
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const sender = payload.sender?.login || 'someone';
  const action = payload.action || 'updated';

  const actionLabel = { added: '➕ Added', removed: '➖ Removed', edited: '✏️ Updated' };

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `${actionLabel[action] || action} collaborator: ${member?.login || 'unknown'}`,
      url: `https://github.com/${repo}`,
      color: action === 'removed' ? 0xed4245 : 0x57f287,
      fields: [
        { name: 'Repository', value: `\`${repo}\``,              inline: true },
        { name: 'Role',       value: `\`${payload.changes?.permission?.to || 'member'}\``, inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

function buildDiscussionEmbed(payload) {
  const discussion = payload.discussion;
  const repo       = payload.repository?.full_name || 'unknown/repo';
  const sender     = payload.sender?.login || 'someone';
  const action     = payload.action || 'updated';

  const fields = [
    { name: 'Category', value: `\`${discussion?.category?.name || 'General'}\``, inline: true },
    { name: 'Status',   value: `\`${action}\``,                                  inline: true }
  ];

  if (discussion?.body?.trim()) {
    fields.push({ name: 'Body', value: trunc(discussion.body, 400), inline: false });
  }

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: trunc(`💬 #${discussion?.number} ${discussion?.title || 'Discussion'}`, 200),
      url: discussion?.html_url || `https://github.com/${repo}/discussions`,
      color: 0x5865f2,
      fields,
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'View Discussion', url: discussion?.html_url },
      { label: 'Open Repo',       url: `https://github.com/${repo}` }
    )
  };
}

/** Fallback for any unhandled event type */
function buildGenericEmbed(payload, eventType) {
  const repo   = payload.repository?.full_name || 'unknown/repo';
  const sender = payload.sender?.login || 'someone';
  const action = payload.action ? ` (${payload.action})` : '';

  return {
    embed: {
      author: { name: sender, icon_url: avatarUrl(sender), url: profileUrl(sender) },
      title: `📣 ${eventType}${action}`,
      url: `https://github.com/${repo}`,
      color: WHITE,
      fields: [
        { name: 'Repository', value: `\`${repo}\``, inline: true },
        { name: 'Event',      value: `\`${eventType}\``, inline: true }
      ],
      timestamp: new Date().toISOString()
    },
    components: actionComponents(
      { label: 'Open Repo', url: `https://github.com/${repo}` }
    )
  };
}

// ── Router ────────────────────────────────────

function buildDiscordPayload(eventType, payload) {
  let result;

  switch (eventType) {
    case 'push':
      result = buildPushEmbed(payload);
      break;
    case 'pull_request':
      result = buildPullRequestEmbed(payload);
      break;
    case 'issues':
      result = buildIssuesEmbed(payload);
      break;
    case 'issue_comment':
    case 'commit_comment':
    case 'pull_request_review_comment':
      result = buildIssueCommentEmbed(payload);
      break;
    case 'create':
    case 'delete':
      result = buildCreateDeleteEmbed(payload, eventType);
      break;
    case 'release':
      result = buildReleaseEmbed(payload);
      break;
    case 'watch': // GitHub calls "star" as "watch" for legacy reasons
    case 'star':
      result = buildStarEmbed(payload);
      break;
    case 'fork':
      result = buildForkEmbed(payload);
      break;
    case 'workflow_run':
      result = buildWorkflowRunEmbed(payload);
      break;
    case 'pull_request_review':
      result = buildPullRequestReviewEmbed(payload);
      break;
    case 'deployment_status':
      result = buildDeploymentStatusEmbed(payload);
      break;
    case 'member':
      result = buildMemberEmbed(payload);
      break;
    case 'discussion':
    case 'discussion_comment':
      result = buildDiscussionEmbed(payload);
      break;
    // Silently ignore noisy / low-value events
    case 'ping':
      return null;
    default:
      result = buildGenericEmbed(payload, eventType);
  }

  // Attach footer GIF to every embed if configured
  if (FOOTER_GIF) {
    result.embed.image = { url: FOOTER_GIF };
  }

  // Webhook profile: nama project sebagai username, avatar custom
  const repoName = payload.repository?.name || 'Pretty Hooks';
  const AVATAR   = process.env.WEBHOOK_AVATAR
    || 'https://i.pinimg.com/736x/3a/6a/b0/3a6ab0f5fc3fbef254484d57e686932a.jpg';

  return {
    username:   repoName,
    avatar_url: AVATAR,
    embeds:     [result.embed],
    components: result.components
  };
}

// ── Discord sender ────────────────────────────

async function sendToDiscord(webhookUrl, body) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord ${res.status}: ${text}`);
    }
    return true;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Netlify handler ───────────────────────────

export const handler = async (event) => {
  // Respond immediately so GitHub doesn't time out
  const immediateResponse = {
    statusCode: 202,
    body: JSON.stringify({ message: 'Accepted' })
  };

  (async () => {
    try {
      // ── Parse body ──
      let rawBody = event.body || '{}';
      if (event.isBase64Encoded) {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      }
      const payload = JSON.parse(rawBody);

      // ── Resolve Discord hook from URL path ──
      const pathParts    = (event.path || '').split('/').filter(Boolean);
      const funcIndex    = pathParts.findIndex(p => p === 'webhook');
      const hookSegments = funcIndex !== -1 ? pathParts.slice(funcIndex + 1) : [];

      if (!hookSegments.length) {
        console.error('No Discord hook segments in path');
        return;
      }

      const hook = hookSegments.join('/');
      if (hook.length > 300) {
        console.error('Hook path too long, possible injection attempt');
        return;
      }

      // ── Detect GitHub event type ──
      const headers   = Object.fromEntries(
        Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
      );
      const eventType = headers['x-github-event'] || 'unknown';

      console.log(`📨 GitHub event: ${eventType} | hook: ${hook}`);

      // ── Build Discord payload ──
      const discordPayload = buildDiscordPayload(eventType, payload);

      if (!discordPayload) {
        console.log(`⏭️  Event '${eventType}' ignored (ping / suppressed)`);
        return;
      }

      // ── Send to Discord ──
      const webhookUrl = `https://discord.com/api/webhooks/${encodeURIComponent(hook)}?with_components=true`;
      await sendToDiscord(webhookUrl, discordPayload);

      console.log(`✅ Sent '${eventType}' for ${payload.repository?.full_name}`);
    } catch (err) {
      console.error('❌ Webhook processing failed:', err.message);
    }
  })();

  return immediateResponse;
};