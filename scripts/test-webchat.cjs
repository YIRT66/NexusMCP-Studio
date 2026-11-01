// Compatibility entry point for the current embedded browser integration test.
import('./test-embedded-webchat.mjs').catch(error=>{console.error(error);process.exitCode=1;});
