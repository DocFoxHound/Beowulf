const getPlayer = require('../api/starcitizen-api');
const { getUserById, editUser } = require('../api/userlistApi');
const cheerio = require('cheerio');

async function verifyUser(handle, userId) {
    console.log(`Verifying RSI handle: ${handle} for user ID: ${userId}`);
    const dbUser = await getUserById(userId);
    let newVerificationCode = null;
    if (dbUser && !dbUser.verification_code) {
        newVerificationCode = Date.now();
        await editUser(userId, { ...dbUser, verification_code: newVerificationCode });
    }
    if (newVerificationCode) {
        return `Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${newVerificationCode}`;
    }
    console.log(`Verifying user: ${handle}`);
    try {
        const res = await fetch(`https://robertsspaceindustries.com/en/citizens/${handle}`);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Extract Bio value
        let bio = null;
        $('.label').each(function() {
            if ($(this).text().trim() === 'Bio') {
                bio = $(this).next('.value').text().trim();
            }
        });
        console.log(`Bio for ${handle}:`, bio);

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
        console.log(`Player organization for ${handle}:`, playerOrg);
        // If found, update dbUser.player_org
        if (playerOrg && dbUser && dbUser.player_org !== playerOrg) {
            console.log(`Updating player organization for userId ${userId} to ${playerOrg}`);
            dbUser.player_org = playerOrg;
            await editUser(userId, { ...dbUser });
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
                console.log(`Verification successful for userId ${userId}, handle ${handle}`);
                // Always save both rsi_handle and player_org
                await editUser(userId, { ...dbUser, rsi_handle: handle, player_org: dbUser.player_org });
                return `Success! Your RSI handle has been verified.`;
            } else if (bio) {
                console.log(`Verification failed for userId ${userId}, handle ${handle}: Verification code not found in bio or HTML.`);
                return `Bio does not contain the verification code. Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${dbUser.verification_code}`;
            }
        } else if (bio) {
            console.log(`Bio for ${handle} does not contain verification code.`);
            return 'Player data retrieved.';
        }
        console.log(`Player not found or error for userId ${userId}, handle ${handle}`);
        return `Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${newVerificationCode}`;
    } catch (err) {
        console.log(`Error verifying handle ${handle}:`, err);
        return `Error: ${err.message}`;
    }
}

module.exports = {
    verifyUser
};  