const getPlayer = require('../api/starcitizen-api');
const { getUserById, editUser } = require('../api/userlistApi');
const cheerio = require('cheerio');

async function verifyUser(handle, userId) {
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

        if (bio && dbUser && dbUser.verification_code) {
            if (bio.includes(dbUser.verification_code.toString())) {
                await editUser(userId, { ...dbUser, rsi_handle: handle });
                return `Success! Your RSI handle has been verified.`;
            } else if (html.includes(dbUser.verification_code.toString())) {
                await editUser(userId, { ...dbUser, rsi_handle: handle });
                return `Success! Your RSI handle has been verified (code found elsewhere in profile).`;
            } else {
                return `Bio does not contain the verification code. Please go to 'https://robertsspaceindustries.com/en/account/profile' and place the following code in your 'Bio' section, save, and then re-verify: ${dbUser.verification_code}`;
            }
        } else if (bio) {
            return 'Player data retrieved.';
        }
        return 'Player not found or error.';
    } catch (err) {
        return `Error: ${err.message}`;
    }
}

module.exports = {
    verifyUser
};  