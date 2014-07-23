var Router = require('../lib/router');

var http = require('http'),
    path = require('path'),
    assert = require('assert'),
    inspect = require('util').inspect;

var t = -1,
    group = path.basename(__filename, '.js') + '/';

var tests = [
  { run: function() {
      var what = this.what,
          router = Router();

      router.get(function(req, res) {
        res.statusCode = 200;
        res.end('Hello World!');
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'Hello World!',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/'
    },
    what: 'GET (default path)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get('/foo', function(req, res) {
        res.statusCode = 200;
        res.end('Hello World!');
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'Hello World!',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo'
    },
    what: 'GET (explicit path)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get(/\/foo.*/, function(req, res) {
        res.statusCode = 200;
        res.end('Hello World!');
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'Hello World!',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foobarbaz'
    },
    what: 'GET (regexp path)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get('/foo/:val', function(req, res) {
        res.statusCode = 200;
        res.end(''+req.params.val);
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'bar',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo/bar'
    },
    what: 'GET (explict path with param)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get('/foo', function(req, res) {
        res.statusCode = 200;
        res.end('Hello World!');
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 404,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'GET /bar Not Found',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/bar'
    },
    what: 'GET (no matching path)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get('/foo', function(req, res, next) {
        next(420);
      });
      router.use(function(err, req, res, next) {
        assert(err.code === 420,
               makeMsg(what, 'Wrong original statusCode: ' + err.code));
        res.statusCode = 418;
        res.end(err.message);
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 418,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'GET /foo Unknown Error',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo'
    },
    what: 'GET (error handler)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.param('val', function(req, res, next, val) {
        assert(val === 'bar', makeMsg(what, 'Wrong param value: ' + val));
        req.params.val = 'baz';
        next();
      });
      router.get('/foo/:val', function(req, res, next) {
        res.statusCode = 200;
        res.end('val is ' + req.params.val);
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === 'val is baz',
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo/bar'
    },
    what: 'GET (param handler)'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      router.get('/foo', function(req, res, next) {
        res.statusCode = 200;
        res.write('hello from first GET handler\n');
        next();
      });
      router.use('/foo', function(req, res, next) {
        res.write('hello from intermediate middleware\n');
        next();
      });
      router.get('/foo', function(req, res, next) {
        res.end('hello from second GET handler');
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === [
                 'hello from first GET handler',
                 'hello from intermediate middleware',
                 'hello from second GET handler'
               ].join('\n'),
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo'
    },
    what: 'method and middleware order'
  },
  { run: function() {
      var what = this.what,
          router = Router();

      function firstHandler(req, res, next) {
        res.statusCode = 200;
        res.write('hello from first GET handler\n');
        next();
      }
      function secondHandler(req, res, next) {
        res.write('hello from second GET handler\n');
        next();
      }
      function thirdHandler(req, res, next) {
        res.end('hello from third GET handler');
      }
      router.get('/foo', firstHandler, secondHandler, thirdHandler);

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === [
                 'hello from first GET handler',
                 'hello from second GET handler',
                 'hello from third GET handler'
               ].join('\n'),
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo'
    },
    what: 'multiple middleware in single call'
  },
  { run: function() {
      var what = this.what,
          router = Router(),
          subrouter = Router();

      router.use('/foo', subrouter);
      subrouter.use('/bar', function (req, res) {
        res.end("i'm foo bar");
      });

      request(router, this.req, function(err, res) {
        assert(!err, makeMsg(what, 'Unexpected error: ' + err));
        assert(res.statusCode === 200,
               makeMsg(what, 'Wrong response statusCode: ' + res.statusCode));
        assert(res.data === "i'm foo bar",
               makeMsg(what, 'Wrong response: ' + inspect(res.data)));
        next();
      });
    },
    req: {
      method: 'GET',
      path: '/foo/bar'
    },
    what: 'router mounted on a router'
  },
];

function request(router, reqOpts, cb) {
  http.createServer(function(req, res) {
    this.close();
    router.handle(req, res);
  }).listen(0, 'localhost', function() {
    var port = this.address().port,
        called = false;
    reqOpts.host = 'localhost';
    reqOpts.port = port;
    http.request(reqOpts, function(res) {
      var buffer = '';
      res.on('data', function(d) {
        buffer += d;
      }).on('end', function() {
        if (called)
          return;
        res.data = buffer;
        cb(null, res);
      }).on('error', function(err) {
        called = true;
        cb(err);
      }).setEncoding('utf8');
    }).on('error', function(err) {
      called = true;
      cb(err);
    }).end();
  });
}

function next() {
  if (t === tests.length - 1)
    return;
  var v = tests[++t];
  v.run.call(v);
}

function makeMsg(what, msg) {
  return '[' + group + what + ']: ' + msg;
}

process.once('uncaughtException', function(err) {
  if (t > -1 && !/(?:^|\n)AssertionError: /i.test(''+err))
    console.log(makeMsg(tests[t].what, 'Unexpected Exception:'));
  throw err;
});
process.once('exit', function() {
  assert(t === tests.length - 1,
         makeMsg('_exit',
                 'Only finished ' + (t + 1) + '/' + tests.length + ' tests'));
});

next();
