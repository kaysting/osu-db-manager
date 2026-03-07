const clc = require('cli-color');

/**
 * @typedef {Object} TestCase
 * @property {string} name The name of the test.
 * @property {Function} f An optionally async function that runs the test logic. Accepts a parameter containing the return value of the previous test.
 * @property {string[]} [requires] Optional array of test names that must pass before this test runs, otherwise this test is skipped.
 * @property {boolean} [expectError] Optional flag indicating the test should throw an error to pass.
 */

/**
 * A very simple test runner.
 * @param {TestCase[]} tests Array of test objects to execute
 */
const run = async tests => {
    let failed = [];
    let skipped = [];
    let passed = [];
    let prevReturn;

    // Loop for each test
    for (const test of tests) {
        try {
            // Ensure test dependencies are met
            if (test.requires) {
                let found = true;
                for (const requiredName of test.requires) {
                    found = passed.find(t => t.name == requiredName);
                    if (!found) break;
                }
                if (!found) {
                    console.log(clc.yellowBright(`SKIPPED:`), test.name);
                    console.log();
                    skipped.push(test);
                    continue;
                }
            }

            // Run the test
            console.log(clc.blueBright(`RUNNING:`), test.name);
            prevReturn = await test.f(prevReturn);

            // Throw error if test expects error but didn't throw
            if (test.expectError) throw new Error(`No error was thrown`);

            // Log and save pass
            console.log(clc.greenBright('PASS!'));
            passed.push(test);
        } catch (error) {
            // Log and save fail
            console.error(clc.redBright(`FAIL:`), error);
            failed.push(test);
        }
        console.log();
    }

    // Print results
    console.log(`Results: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed:`);
    for (const t of passed) {
        console.log(clc.greenBright(' PASS:'), t.name);
    }
    for (const t of failed) {
        console.log(clc.redBright(' FAIL:'), t.name);
    }
    for (const t of skipped) {
        console.log(clc.yellowBright(' SKIP:'), t.name);
    }

    // Exit with code based on present failures
    process.exit(failed.length != 0 ? 1 : 0);
};

module.exports = run;
