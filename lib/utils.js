const log = (...args) => {
    if (!process.env.ODBM_VERBOSE) return;
    console.log(`[odbm]`, ...args);
};

module.exports = {
    log
};
