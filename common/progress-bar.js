// ■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□
async function progressBar(currentValue, maxValue, totalSpaces, filledChar, emptyChar) {
    const filledSpaces = Math.round((currentValue / maxValue) * totalSpaces);
    const emptySpaces = totalSpaces - filledSpaces;

    const progressBar = `${filledChar}`.repeat(filledSpaces) + `${emptyChar}`.repeat(emptySpaces);
    return progressBar;
}

module.exports = {
    progressBar
}