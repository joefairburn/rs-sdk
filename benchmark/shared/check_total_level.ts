/**
 * Verification: report total level as reward.
 * Also reads the skill tracking JSON file and copies it to verifier output.
 *
 * Writes total level to reward.txt for Harbor compatibility.
 * Writes full skill data + tracking history to reward.json.
 */
import { BotSDK } from '/app/sdk/index';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';

const TRACKING_FILE = '/logs/verifier/skill_tracking.json';

async function main() {
    const sdk = new BotSDK({
        botUsername: 'agent',
        password: 'test',
        gatewayUrl: 'ws://localhost:7780',
        connectionMode: 'observe',
        autoLaunchBrowser: false,
        autoReconnect: false,
    });

    try {
        await sdk.connect();
        await sdk.waitForCondition(s => s.inGame && s.skills.length > 0, 15000);

        const skills = sdk.getSkills();
        let totalLevel = 0;
        const skillData: Record<string, { level: number; xp: number }> = {};

        for (const s of skills) {
            skillData[s.name] = { level: s.baseLevel, xp: s.experience };
            totalLevel += s.baseLevel;
        }

        console.log(`Total level: ${totalLevel}`);
        for (const [name, data] of Object.entries(skillData)) {
            if (data.level > 1) {
                console.log(`  ${name}: level ${data.level}, xp ${data.xp}`);
            }
        }

        mkdirSync('/logs/verifier', { recursive: true });

        // Read tracking data if it exists
        let trackingData = null;
        if (existsSync(TRACKING_FILE)) {
            try {
                trackingData = JSON.parse(readFileSync(TRACKING_FILE, 'utf-8'));
                console.log(`Tracking data: ${trackingData.samples?.length ?? 0} samples`);
            } catch (err) {
                console.error('Failed to read tracking data:', err);
            }
        } else {
            console.log('No tracking data file found');
        }

        // Write reward files
        writeFileSync('/logs/verifier/reward.txt', totalLevel.toString());
        writeFileSync('/logs/verifier/reward.json', JSON.stringify({
            totalLevel,
            skills: skillData,
            tracking: trackingData,
        }, null, 2));

        console.log(`Reward: totalLevel=${totalLevel}`);
    } finally {
        sdk.disconnect();
    }
}

main().catch(err => {
    console.error('Verification error:', err);
    try {
        mkdirSync('/logs/verifier', { recursive: true });
        writeFileSync('/logs/verifier/reward.txt', '0');
        writeFileSync('/logs/verifier/reward.json', JSON.stringify({
            totalLevel: 0,
            error: err.message,
        }));
    } catch {}
    process.exit(1);
});
