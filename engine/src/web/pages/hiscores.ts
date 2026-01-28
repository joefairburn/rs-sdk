import { db } from '#/db/query.js';
import { tryParseInt } from '#/util/TryParse.js';
import { escapeHtml, SKILL_NAMES, ENABLED_SKILLS } from '../utils.js';

// Shared CSS styles for hiscores pages
const HISCORES_STYLES = `
    body, p, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
    body { background: #000; color: #fff; margin: 0; padding: 0; }
    a { text-decoration: none; }
    .b { border-style: outset; border-width: 3pt; border-color: #373737; }
    .b2 { border-style: outset; border-width: 3pt; border-color: #570700; }
    .e { border: 2px solid #382418; }
    .c { text-decoration: none; color: #fff; }
    .c:hover { text-decoration: underline; }
    .white { text-decoration: none; color: #FFFFFF; }
    .red { text-decoration: none; color: #E10505; }
    .lblue { text-decoration: none; color: #9DB8C3; }
    .dblue { text-decoration: none; color: #0D6083; }
    .yellow { text-decoration: none; color: #FFE139; }
    .green { text-decoration: none; color: #04A800; }
    .purple { text-decoration: none; color: #C503FD; }
    .text-orange { color: #ffbb22; }
    select { background-color: #B1977E; }
    input { margin-top: 4px; }
`;

// Player profile page handler
export async function handleHiscoresPlayerPage(url: URL): Promise<Response | null> {
    const match = url.pathname.match(/^\/hiscores\/player\/([^/]+)\/?$/);
    if (!match) {
        return null;
    }

    const username = decodeURIComponent(match[1]);
    const profile = url.searchParams.get('profile') || 'main';

    // Find the account
    const account = await db
        .selectFrom('account')
        .select(['id', 'username'])
        .where('username', '=', username)
        .where('staffmodlevel', '<=', 1)
        .executeTakeFirst();

    if (!account) {
        return new Response(`Player "${escapeHtml(username)}" not found.`, {
            status: 404,
            headers: { 'Content-Type': 'text/html' }
        });
    }

    // Get overall stats
    const overallStats = await db
        .selectFrom('hiscore_large')
        .select(['level', 'value'])
        .where('account_id', '=', account.id)
        .where('profile', '=', profile)
        .where('type', '=', 0)
        .executeTakeFirst();

    // Get overall rank
    let overallRank = '-';
    if (overallStats) {
        const rankResult = await db
            .selectFrom('hiscore_large')
            .innerJoin('account', 'account.id', 'hiscore_large.account_id')
            .select(db.fn.count('hiscore_large.account_id').as('rank'))
            .where('hiscore_large.type', '=', 0)
            .where('hiscore_large.profile', '=', profile)
            .where('account.staffmodlevel', '<=', 1)
            .where('hiscore_large.value', '>', overallStats.value)
            .executeTakeFirst();
        overallRank = String((Number(rankResult?.rank) || 0) + 1);
    }

    // Get individual skill stats
    const skillStats = await db
        .selectFrom('hiscore')
        .select(['type', 'level', 'value'])
        .where('account_id', '=', account.id)
        .where('profile', '=', profile)
        .execute();

    // Build skill rows with ranks
    const skillRows: string[] = [];

    // Overall row first
    skillRows.push(`
        <tr>
            <td><a href="/hiscores?category=0&profile=${profile}" class="c">Overall</a></td>
            <td align="right">${overallRank}</td>
            <td align="right">${overallStats ? overallStats.level.toLocaleString() : '-'}</td>
            <td align="right">${overallStats ? Number(overallStats.value).toLocaleString() : '-'}</td>
        </tr>
    `);

    // Individual skills
    for (const skill of ENABLED_SKILLS) {
        const stat = skillStats.find(s => s.type === skill.id + 1);
        let rank = '-';

        if (stat) {
            const rankResult = await db
                .selectFrom('hiscore')
                .innerJoin('account', 'account.id', 'hiscore.account_id')
                .select(db.fn.count('hiscore.account_id').as('rank'))
                .where('hiscore.type', '=', skill.id + 1)
                .where('hiscore.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .where('hiscore.value', '>', stat.value)
                .executeTakeFirst();
            rank = String((Number(rankResult?.rank) || 0) + 1);
        }

        skillRows.push(`
            <tr>
                <td><a href="/hiscores?category=${skill.id + 1}&profile=${profile}" class="c">${skill.name}</a></td>
                <td align="right">${rank}</td>
                <td align="right">${stat ? stat.level.toLocaleString() : '-'}</td>
                <td align="right">${stat ? stat.value.toLocaleString() : '-'}</td>
            </tr>
        `);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Hiscores for ${escapeHtml(account.username)}</title>
    <style>${HISCORES_STYLES}</style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="350" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Hiscores for ${escapeHtml(account.username)}</b><br>
                                <a href="/" class="c">Main menu</a> | <a href="/hiscores?profile=${profile}" class="c">All Hiscores</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Profile selector -->
                <center>
                    <form method="GET" action="/hiscores/player/${encodeURIComponent(account.username)}">
                        <select name="profile" onchange="this.form.submit()">
                            <option value="main"${profile === 'main' ? ' selected' : ''}>Main</option>
                        </select>
                    </form>
                </center>

                <!-- Stats table -->
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <table width="100%" cellspacing="2" cellpadding="2">
                                <tr>
                                    <td><b>Skill</b></td>
                                    <td align="right"><b>Rank</b></td>
                                    <td align="right"><b>Level</b></td>
                                    <td align="right"><b>XP</b></td>
                                </tr>
                                ${skillRows.join('')}
                            </table>
                        </td>
                    </tr>
                </table>

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function handleHiscoresPage(url: URL): Promise<Response | null> {
    if (url.pathname !== '/hiscores' && url.pathname !== '/hiscores/') {
        return null;
    }

    const category = tryParseInt(url.searchParams.get('category'), -1);
    const profile = url.searchParams.get('profile') || 'main';
    const playerSearch = url.searchParams.get('player')?.toLowerCase().trim() || '';
    const rankSearch = tryParseInt(url.searchParams.get('rank'), -1);

    let rows: { rank: number; username: string; level: number; xp: number }[] = [];
    let selectedSkill = 'Overall';
    let searchedPlayer: { rank: number; username: string; level: number; xp: number } | null = null;

    if (category === -1 || category === 0) {
        // Overall - query hiscore_large
        let query = db
            .selectFrom('hiscore_large')
            .innerJoin('account', 'account.id', 'hiscore_large.account_id')
            .select(['account.username', 'hiscore_large.level', 'hiscore_large.value'])
            .where('hiscore_large.type', '=', 0)
            .where('hiscore_large.profile', '=', profile)
            .where('account.staffmodlevel', '<=', 1)
            .orderBy('hiscore_large.value', 'desc');

        const allResults = await query.execute();

        // Handle rank search - show 21 entries starting from that rank
        const startRank = rankSearch > 0 ? rankSearch - 1 : 0;
        rows = allResults.slice(startRank, startRank + 21).map((r, i) => ({
            rank: startRank + i + 1,
            username: r.username,
            level: r.level,
            xp: Number(r.value)
        }));

        if (playerSearch) {
            const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
            if (idx !== -1) {
                const r = allResults[idx];
                searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, xp: Number(r.value) };
            }
        }
        selectedSkill = 'Overall';
    } else {
        // Individual skill - query hiscore
        const skillIndex = category - 1;
        const skillName = SKILL_NAMES[skillIndex];
        if (skillName) {
            let query = db
                .selectFrom('hiscore')
                .innerJoin('account', 'account.id', 'hiscore.account_id')
                .select(['account.username', 'hiscore.level', 'hiscore.value'])
                .where('hiscore.type', '=', category)
                .where('hiscore.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .orderBy('hiscore.value', 'desc');

            const allResults = await query.execute();

            const startRank = rankSearch > 0 ? rankSearch - 1 : 0;
            rows = allResults.slice(startRank, startRank + 21).map((r, i) => ({
                rank: startRank + i + 1,
                username: r.username,
                level: r.level,
                xp: r.value
            }));

            if (playerSearch) {
                const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
                if (idx !== -1) {
                    const r = allResults[idx];
                    searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, xp: r.value };
                }
            }
            selectedSkill = skillName;
        }
    }

    const formatXp = (xp: number) => xp.toLocaleString();

    const skillOptions = [
        { id: 0, name: 'Overall' },
        ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))
    ];

    const currentCategory = category === -1 ? 0 : category;

    // Build skill links for sidebar
    const skillLinks = skillOptions.map(s =>
        `<tr><td><a href="/hiscores?category=${s.id}&profile=${profile}" class="c">${s.name}</a></td></tr>`
    ).join('\n');

    // Build data rows
    const rankCol = rows.map(r => `${r.rank}<br>`).join('\n');
    const nameCol = rows.map(r =>
        `<a href="/hiscores/player/${encodeURIComponent(r.username)}?profile=${profile}" class="c">${escapeHtml(r.username)}</a><br>`
    ).join('\n');
    const levelCol = rows.map(r => `${r.level.toLocaleString()}<br>`).join('\n');
    const xpCol = rows.map(r => `${formatXp(r.xp)}<br>`).join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>${selectedSkill} Hiscores</title>
    <style>
        body, p, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
        body { background: #000; color: #fff; margin: 0; padding: 0; }
        a { text-decoration: none; }
        .b { border-style: outset; border-width: 3pt; border-color: #373737; }
        .b2 { border-style: outset; border-width: 3pt; border-color: #570700; }
        .e { border: 2px solid #382418; }
        .c { text-decoration: none; color: #fff; }
        .c:hover { text-decoration: underline; }
        .white { text-decoration: none; color: #FFFFFF; }
        .red { text-decoration: none; color: #E10505; }
        .lblue { text-decoration: none; color: #9DB8C3; }
        .dblue { text-decoration: none; color: #0D6083; }
        .yellow { text-decoration: none; color: #FFE139; }
        .green { text-decoration: none; color: #04A800; }
        .purple { text-decoration: none; color: #C503FD; }
        .text-orange { color: #ffbb22; }
        select { background-color: #B1977E; }
        input { margin-top: 4px; }
    </style>
</head>
<body>
<table width="100%" height="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td valign="middle">
            <center>
                <div style="width: 600px; position: relative;">

<!-- Top edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_a.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_d.jpg" width="100" height="43"></td>
    </tr>
</table>

<!-- Main content area -->
<table width="600" cellpadding="0" cellspacing="0" border="0" background="/img/background2.jpg">
    <tr>
        <td valign="bottom">
            <center>
                <br>
                <!-- Title box -->
                <table width="250" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>${selectedSkill} Hiscores</b><br>
                                <a href="/" class="c">Main menu</a>
                            </center>
                        </td>
                    </tr>
                </table>
                <br>

                <!-- Profile selector -->
                <center>
                    <form id="profile-select-form" method="GET" action="/hiscores">
                        <input type="hidden" name="category" value="${currentCategory}">
                        <select name="profile" id="profile" onchange="this.form.submit()">
                            <option value="main"${profile === 'main' ? ' selected' : ''}>Main</option>
                        </select>
                    </form>
                </center>

                <!-- Two column layout: skills + data -->
                <table>
                    <tr>
                        <td width="160" valign="top">
                            <center>
                                <b>Select hiscore table</b><br>
                                <table width="150" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            <center>
                                                <table height="380" cellspacing="1" cellpadding="0">
                                                    ${skillLinks}
                                                </table>
                                            </center>
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>

                        <td width="290" valign="top">
                            <center>
                                <b>${selectedSkill} Hiscores</b><br>
                                <table width="300" height="400" bgcolor="black" cellpadding="4">
                                    <tr>
                                        <td class="e" valign="top">
                                            ${rows.length > 0 ? `<table>
                                                <tr>
                                                    <td align="right" valign="top">
                                                        <b>Rank</b><br>
                                                        ${rankCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td valign="top">
                                                        <b>Name</b><br>
                                                        ${nameCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td valign="top">
                                                        <b>Level</b><br>
                                                        ${levelCol}
                                                    </td>
                                                    <td>&nbsp;</td>
                                                    <td align="right" valign="top">
                                                        <b>XP</b><br>
                                                        ${xpCol}
                                                    </td>
                                                </tr>
                                            </table>` : '<center><br>No players found</center>'}
                                        </td>
                                    </tr>
                                </table>
                            </center>
                        </td>
                    </tr>
                </table>

                <br>

                <!-- Search boxes -->
                <table>
                    <tr>
                        <td>
                            <table width="200" bgcolor="black" cellpadding="4">
                                <tr>
                                    <td class="b" bgcolor="#474747" background="/img/stoneback.gif">
                                        <center>
                                            <form action="/hiscores">
                                                <b>Search by rank</b><br>
                                                <input type="number" maxlength="12" size="12" name="rank" value="">
                                                <input type="hidden" name="category" value="${currentCategory}">
                                                <input type="hidden" name="profile" value="${profile}">
                                                <br>
                                                <input type="submit" value="Search">
                                            </form>
                                        </center>
                                    </td>
                                </tr>
                            </table>
                        </td>
                        <td>&nbsp;&nbsp;&nbsp;</td>
                        <td>
                            <table width="200" bgcolor="black" cellpadding="4">
                                <tr>
                                    <td class="b" bgcolor="#474747" background="/img/stoneback.gif">
                                        <center>
                                            <form action="/hiscores" autocomplete="off">
                                                <b>Search by name</b><br>
                                                <input type="text" maxlength="12" size="12" name="player" value="${escapeHtml(playerSearch)}" autocomplete="off">
                                                <input type="hidden" name="category" value="${currentCategory}">
                                                <input type="hidden" name="profile" value="${profile}">
                                                <br>
                                                <input type="submit" value="Search">
                                            </form>
                                        </center>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                ${searchedPlayer ? `
                <br>
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>
                                <b>Search Result</b><br>
                                Rank: ${searchedPlayer.rank} |
                                <a href="/hiscores/player/${encodeURIComponent(searchedPlayer.username)}?profile=${profile}" class="c">${escapeHtml(searchedPlayer.username)}</a> |
                                Level: ${searchedPlayer.level.toLocaleString()} |
                                XP: ${formatXp(searchedPlayer.xp)}
                            </center>
                        </td>
                    </tr>
                </table>
                ` : playerSearch ? `
                <br>
                <table width="400" bgcolor="black" cellpadding="4">
                    <tr>
                        <td class="e">
                            <center>Player "${escapeHtml(playerSearch)}" not found.</center>
                        </td>
                    </tr>
                </table>
                ` : ''}

                <br>
            </center>
        </td>
    </tr>
</table>

<!-- Bottom edge decoration -->
<table cellpadding="0" cellspacing="0">
    <tr>
        <td valign="top"><img src="/img/edge_g2.jpg" width="100" height="43"></td>
        <td valign="top"><img src="/img/edge_c.jpg" width="400" height="42"></td>
        <td valign="top"><img src="/img/edge_h2.jpg" width="100" height="43"></td>
    </tr>
</table>

                </div>
            </center>
        </td>
    </tr>
</table>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
