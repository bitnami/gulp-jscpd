'use strict';

require('coffeescript/register');
var path             = require('path');
var util             = require('util');
var log              = require('fancy-log');
var colors           = require('ansi-colors');
var PluginError      = require('plugin-error');
var through          = require('through2');
var winston          = require('winston');
var TokenizerFactory = require('jscpd/lib/tokenizer/TokenizerFactory');
var Mapper           = require('jscpd/lib/map').Map;
var Strategy         = require('jscpd/lib/strategy').Strategy;
var Report           = require('jscpd/lib/report').Report;

var optionsPreprocessor = require('jscpd/lib/preprocessors/options');

winston.remove(winston.transports.Console); // Silent jscpd logging messages

module.exports = function(opts) {
  opts = util._extend({
    'min-lines' : 5,
    'min-tokens': 70,
    reporter    : 'xml',
    languages   : Object.keys(TokenizerFactory.prototype.LANGUAGES),
    output      : null,
    path        : null,
    verbose     : false,
    debug       : false,
    silent      : false,
    failOnError : true,
    'xsl-href'  : null
  }, opts);
  opts = optionsPreprocessor({options: opts});
  var result   = [];
  var map      = new Mapper();
  var strategy = new Strategy(opts);
  var report   = new Report({
    verbose: opts.verbose,
    output: opts.output,
    reporter: opts.reporter,
    'xsl-href': opts['xsl-href']
  });

  if (opts.debug) {
    log('----------------------------------------');
    log('Options:');
    for (var name in opts) {
      var opt = opts[name];
      log(name + ' = ' + opt);
    }
    log('----------------------------------------');
    log('Files:');
  }

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      this.push(file);
      return cb();
    }
    if (file.isStream()) {
      this.emit('error', new PluginError('gulp-jscpd', 'Streaming not supported'));
      return cb();
    }
    if (opts.debug) {
      log(file.path);
    } else {
      strategy.detect(map, file.path, opts['min-lines'], opts['min-tokens']);
    }

    this.push(file);
    cb();
  }, function(cb) {
    if (opts.debug) {
      log('----------------------------------------');
      log('Run without debug option for start detection process');
      return cb();
    }
    report.generate(map);
    map.clones.forEach(function(err) {
      var clone = 'Lines ' +
        colors.cyan(err.firstFileStart) + '-' +
        colors.cyan(err.firstFileStart + err.linesCount);
      if (err.firstFile !== err.secondFile) {
        clone += ' in ' + colors.magenta(path.relative('.', err.firstFile));
      }
      clone += ' are duplicates of lines ' +
        colors.cyan(err.secondFileStart) + '-' +
        colors.cyan(err.secondFileStart + err.linesCount) + ' in ' +
        colors.magenta(path.relative('.', err.secondFile));
      if (opts.verbose) {
        clone += '\n\n' + err.getLines() + '\n';
      }
      result.push(clone);
    });

    if (result.length > 0) {
      var output = colors.red(
        'Found ' + result.length + ' exact clones with ' + map.numberOfDuplication +
        ' duplicated lines in ' + map.numberOfFiles + ' files\n\n'
      );
      output += result.join('\n') + '\n\n';
      output += colors.red(
        map.getPercentage() + '% (' + map.numberOfDuplication + ' lines) ' +
        'duplicated lines out of ' + map.numberOfLines + ' total lines of code'
      );
      if (typeof opts.output === 'string' && opts.output.length > 0) {
        output += colors.red(
          '\n\nThe full report can be found at: ' + path.resolve(opts.output)
        );
      }
      if (!opts.silent) {
        if (opts.failOnError) {
          this.emit('error', new PluginError('gulp-jscpd', output, {
            showStack: false
          }));
        } else {
          log(output);
        }
      }
    }

    return cb();
  });
};
