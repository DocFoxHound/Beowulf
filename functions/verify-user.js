const getPlayer = require('../api/starcitizen-api');
const { getUserById, editUser } = require('../api/userlistApi');
const cheerio = require('cheerio');

async function verifyUser(handle, userId) {
    console.debug(`[verifyUser] Verifying RSI handle: ${handle} for user ID: ${userId}`);
    let dbUser;
    try {
        dbUser = await getUserById(userId);
        console.debug(`[verifyUser] DB user fetched: ${JSON.stringify(dbUser)}`);
    } catch (err) {
        console.error(`[verifyUser] Error fetching user from DB:`, err);
        return `Error fetching user from DB: ${err.message}`;
    }
    let newVerificationCode = null;
    if (dbUser && !dbUser.verification_code) {
        newVerificationCode = Date.now();
        try {
            await editUser(userId, { ...dbUser, verification_code: newVerificationCode });
            console.debug(`[verifyUser] Set new verification code for user: ${newVerificationCode}`);
        } catch (err) {
            console.error(`[verifyUser] Error setting new verification code:`, err);
            return `Error setting verification code: ${err.message}`;
        }
    }
    if (newVerificationCode) {
        console.debug(`[verifyUser] Returning new verification code message.`);
        return `Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${newVerificationCode}`;
    }
    console.debug(`[verifyUser] Proceeding to verify user: ${handle}`);
    try {
        const res = await fetch(`https://robertsspaceindustries.com/en/citizens/${handle}`);
        console.debug(`[verifyUser] Fetched RSI profile page for handle: ${handle}`);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Extract Bio value
        let bio = null;
        $('.label').each(function() {
            if ($(this).text().trim() === 'Bio') {
                bio = $(this).next('.value').text().trim();
            }
        });
        console.debug(`[verifyUser] Bio for ${handle}: ${bio}`);

        // Extract Main Organization by finding the first <a href="/orgs/ORGNAME">
        let playerOrg = null;
        const orgLink = $('a[href^="/orgs/"]').first();
        if (orgLink.length) {
            const href = orgLink.attr('href');
            if (href) {
                const parts = href.split('/');
                playerOrg = parts[parts.length - 1];
            }
        }
        console.debug(`[verifyUser] Player organization for ${handle}: ${playerOrg}`);
        // If found, update dbUser.player_org
        if (playerOrg && dbUser && dbUser.player_org !== playerOrg) {
            console.debug(`[verifyUser] Updating player organization for userId ${userId} to ${playerOrg}`);
            dbUser.player_org = playerOrg;
            try {
                await editUser(userId, { ...dbUser });
            } catch (err) {
                console.error(`[verifyUser] Error updating player organization:`, err);
            }
        }
        if (dbUser && dbUser.verification_code) {
            const verificationCodeStr = dbUser.verification_code.toString();
            let foundCode = false;
            if (bio && bio.includes(verificationCodeStr)) {
                foundCode = true;
            } else if (html && html.includes(verificationCodeStr)) {
                foundCode = true;
            }
            if (foundCode) {
                console.debug(`[verifyUser] Verification successful for userId ${userId}, handle ${handle}`);
                // Always save both rsi_handle and player_org
                try {
                    await editUser(userId, { ...dbUser, rsi_handle: handle, player_org: dbUser.player_org });
                } catch (err) {
                    console.error(`[verifyUser] Error saving verified user:`, err);
                }
                return `Success! Your RSI handle has been verified.`;
            } else if (bio) {
                console.debug(`[verifyUser] Verification failed for userId ${userId}, handle ${handle}: Verification code not found in bio or HTML.`);
                return `Bio does not contain the verification code. Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${dbUser.verification_code}`;
            }
        } else if (bio) {
            console.debug(`[verifyUser] Bio for ${handle} does not contain verification code.`);
            return 'Player data retrieved.';
        }
        console.debug(`[verifyUser] Player not found or error for userId ${userId}, handle ${handle}`);
        return `Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${newVerificationCode}`;
    } catch (err) {
        console.error(`[verifyUser] Error verifying handle ${handle}:`, err);
        return `Error: ${err.message}`;
    }
}

module.exports = {
    verifyUser
};  