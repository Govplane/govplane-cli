#!/usr/bin/env node
/**
 * Govplane CLI launcher.
 *
 * This file is intentionally dependency-free and written against the oldest
 * syntax we still expect to parse, so that an unsupported Node.js runtime
 * produces a readable message instead of a syntax error or a stack trace.
 */

var MINIMUM_NODE_MAJOR = 20;
var EXIT_COMPATIBILITY = 4;
var EXIT_INTERNAL_ERROR = 5;

var current = process.versions.node;
var major = Number.parseInt(current.split('.')[0], 10);

if (Number.isNaN(major) || major < MINIMUM_NODE_MAJOR) {
  process.stderr.write(
    'Govplane CLI requires Node.js ' + MINIMUM_NODE_MAJOR + ' or later. '
      + 'Current version: Node.js ' + current + '\n',
  );
  process.exit(EXIT_COMPATIBILITY);
}

// When output is piped into a command that exits early — `govplane help | head`
// — the write side is closed under us. That is a normal way to stop reading,
// not a failure, so it must not surface as an unhandled error.
function ignoreEpipe(stream) {
  stream.on('error', function onError(error) {
    if (error && error.code === 'EPIPE') {
      process.exit(0);
    }
    throw error;
  });
}

ignoreEpipe(process.stdout);
ignoreEpipe(process.stderr);

import('../dist/cli.js')
  .then(function run(module) {
    return module.main(process.argv.slice(2));
  })
  .then(function exit(code) {
    process.exitCode = code;
  })
  .catch(function fail(error) {
    process.stderr.write('Govplane CLI failed to start: ' + (error && error.message) + '\n');
    process.exitCode = EXIT_INTERNAL_ERROR;
  });
