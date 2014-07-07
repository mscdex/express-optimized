var http = require('http'),
    https = require('https'),
    url = require('fast-url-parser'),
    qsparse = require('./querystring').parse,
    path = require('path'),
    urljoin = require('./path-join'),
    util = require('util');

var pathRegex = require('path-to-regexp');

var EMPTY_OBJ = {},
    STATUS_CODES = http.STATUS_CODES,
    METHODS;

if (http.METHODS)
  METHODS = http.METHODS;
else {
  METHODS = [
    'DELETE',
    'GET',
    'HEAD',
    'POST',
    'PUT',
    /* PATHOLOGICAL */
    'CONNECT',
    'OPTIONS',
    'TRACE',
    /* WEBDAV */
    'COPY',
    'LOCK',
    'MKCOL',
    'MOVE',
    'PROPFIND',
    'PROPPATCH',
    'SEARCH',
    'UNLOCK',
    /* SUBVERSION */
    'REPORT',
    'MKACTIVITY',
    'CHECKOUT',
    'MERGE',
    /* UPNP */
    'MSEARCH',
    'NOTIFY',
    'SUBSCRIBE',
    'UNSUBSCRIBE',
    /* RFC-5789 */
    'PATCH',
    'PURGE'
  ].sort();
}
METHODS = METHODS.map(function(method) { return method.toLowerCase(); });

function Router(opts) {
  if (!(this instanceof Router))
    return new Router(opts);

  var self = this;

  // [ regexp, pathkeys, methodMap/handler ]
  this._stack = [];

  this._paramFuncs = {};
  this._mounted = false;

  this.path = '/';

  this.handler = function routerHandlerWrap(req, res, cb) {
    self.handle(req, res, cb);
  };
}

Router.prototype.handle = function routerReqHandler(req, res, cb) {
  var stack = this._stack,
      stacklen = stack.length,
      ptr = 0,
      methodPtr = 0,
      paramPtr = 0,
      paramsCache = {},
      paramFuncs = this._paramFuncs,
      urlpath = req.url,
      qm = urlpath.indexOf('?'),
      pathname,
      params;

  //var reqid = ''+Date.now();

  // req/res decorations
  if (qm > -1) {
    req.path = pathname = urlpath.substring(0, qm);
    if (qm === urlpath.length - 1)
      req.query = {};
    else
      req.query = qsparse(urlpath.substring(qm + 1));
  } else {
    req.path = pathname = urlpath;
    req.query = {};
  }
  req.router = res.router = this;
  // end req/res decorations

  function next(err) {
    var curmw,
        m,
        error;

    if (err !== undefined && err !== null) {
      if (util.isError(err))
        error = err;
      else if (typeof err === 'string') {
        error = new Error(err);
        error.code = err.code || this.DEFAULT_ERROR_STATUS;
      } else {
        error = new Error(req.method + ' ' + pathname + ' Unknown error');
        error.code = this.DEFAULT_ERROR_STATUS;
      }
    }

    for (; ptr < stacklen; ++ptr, methodPtr = 0, paramPtr = 0) {
      //console.log(reqid, 'ptr', ptr, 'methodPtr', methodPtr, 'stacklen', stacklen);
      curmw = stack[ptr];
      if (m = curmw[0].exec(pathname)) {
        var methodMap = curmw[2],
            isMethodHandler = false,
            handler;
        if (typeof methodMap === 'function') {
          // general middleware (`router.use()`)
          ++ptr;
          handler = methodMap;
        } else if (handler = methodMap[req.method]) {
          if (typeof handler === 'function') {
            // method-specific middleware (`router.get()`)
            //  (simple case)
            ++ptr;
          } else if (methodPtr < handler.length) {
            // method-specific middleware (`router.get()`)
            //  (complex case, multiple handlers for same method)
            var methodLen = handler.length;
            for (; methodPtr < methodLen; ++methodPtr) {
              if ((error === undefined && handler[methodPtr].length < 4)
                  || (error !== undefined && handler[methodPtr].length === 4)) {
                handler = handler[methodPtr++];
                isMethodHandler = true;
                break;
              }
            }
          }
        }

        if (typeof handler === 'function'
            && ((error === undefined && handler.length < 4)
                || (error !== undefined && handler.length === 4))) {
          // check for `router.param('foo', cb);` calls before route handler
          if (curmw[1] && curmw[1].length) {
            var resrc = curmw[0].toString();
            req.params = (paramsCache[resrc]
                          || (paramsCache[resrc] = makeParams(m, curmw[1])));
            var paramKeys = Object.keys(req.params);
            for (var lenk = paramKeys.length, fn; paramPtr < lenk; ++paramPtr) {
              if (fn = paramFuncs[paramKeys[k]]) {
                if (isMethodHandler)
                  --methodPtr;
                ++paramPtr;
                return fn(req, res, next, req.params[paramKeys[k]]);
              }
            }
          } else
            req.params = EMPTY_OBJ;

          try {
            if (error === undefined)
              return handler(req, res, next);
            else
              return handler(error, req, res, next);
          } catch (ex) {
            error = ex;
            error.code = 500;
          }
        }
      }
    }
    if (ptr === stacklen) {
      if (cb)
        cb(error);
      else if (error === undefined)
        res.end(req.method + ' ' + pathname + ' ' + STATUS_CODES[res.statusCode = 404]);
      else {
        res.statusCode = error.code;
        res.end(error.message);
      }
    }
  }

  next();
};
Router.prototype.DEFAULT_ERROR_STATUS = 500;

Router.prototype.use = function routerUse(route, handler, handler2) {
  var handlersStart = 1,
      handlersEnd = arguments.length,
      routes = route,
      method;

  if (arguments.length > 2
      && typeof arguments[arguments.length - 1] === 'string') {
    method = arguments[arguments.length - 1].toUpperCase();
    --handlersEnd;
  }

  if (route instanceof Router)
    throw new Error('You must specify string path(s) when mounting a Router');
  else if (typeof route === 'function') {
    handlersStart = 0;
    if (handlersEnd - handlersStart === 1 && route.length === 4)
      routes = [ urljoin(this.path, '*') ];
    else
      routes = [ this.path ];
  }

  for (var i = 0, len = routes.length, regex, keys, methodMap; i < len; ++i) {
    var fullPath;
    if (util.isRegExp(routes[i])) {
      keys = null;
      regex = routes[i];
    } else {
      keys = [];
      fullPath = urljoin(this.path, routes[i]);
      regex = pathRegex(fullPath, keys);
    }

    for (var h = handlersStart; h < handlersEnd; ++h) {
      var handlerfn = arguments[h];
      if (typeof handlerfn !== 'function' && !(handlerfn instanceof Router))
        continue;
      else if (handlerfn instanceof Router) {
        if (keys === null)
          throw new Error('You must specify a string path when mounting a Router');
        else if (handlerfn._mounted)
          throw new Error('Cannot mount a Router in multiple places');
        handlerfn.path = fullPath;
        handlerfn._mounted = true;
        handlerfn = handlerfn.handler;
      }

      if (method) {
        var stack = this._stack,
            skip = false,
            mwregex,
            methodMap;

        // check for same, pre-existing path to append method-specific handler.
        // this helps reduce the middleware stack size by grouping together
        // like handlers as much as possible
        for (var j = 0, lenj = stack.length; j < lenj; ++j) {
          mwregex = stack[j][0];
          var stackHandler = stack[j][2];
          if (mwregex.source === regex.source
              && mwregex.global === regex.global
              && mwregex.ignoreCase === regex.ignoreCase
              && mwregex.multiline === regex.multiline
              && typeof stackHandler !== 'function') {
            var fn = stackHandler[method];
            if (!Array.isArray(fn))
              stackHandler[method] = [fn, handlerfn];
            else
              fn.push(handlerfn);
            skip = true;
            break;
          }
        }
        if (skip)
          continue;
        methodMap = {};
        methodMap[method] = handlerfn;
      } else
        methodMap = handlerfn;

      this._stack.push([
        regex,
        keys,
        methodMap
      ]);
    }
  }

  return this;
};

Router.prototype.all = Router.prototype.use;

METHODS.forEach(function(method) {
  Router.prototype[method] = function methodRoute(route, handler) {
    switch (arguments.length) {
      case 1:
      case 2:
        return this.use(route, handler, method);
      break;

      case 3:
        return this.use(route, handler, arguments[2], method);
      break;

      case 4:
        return this.use(route, handler, arguments[2], arguments[3], method);
      break;

      case 5:
        return this.use(route,
                        handler,
                        arguments[2],
                        arguments[3],
                        arguments[4],
                        method);
      break;

      default:
        var args = new Array(arguments.length + 1);
        for (var i = 0, len = args.length; i < len; ++i)
          args[i] = arguments[i];
        args[i] = method;
        return this.use.apply(this, args);
    }
  };
});

Router.prototype.param = function(name, cb) {
  if (typeof name !== 'string')
    throw new Error('Param name is required');
  if (typeof cb === 'function')
    this._paramFuncs[name] = cb;
};

Router.prototype.route = function(path, opts) {
  var router = new Router(opts);
  this.use(path, router);
  return router;
};

module.exports = Router;



function decodeParam(val) {
  if (typeof val !== 'string')
    return val;

  try {
    return decodeURIComponent(val);
  } catch (e) {
    return false;
  }
}

function makeParams(m, keys) {
  if (!keys)
    return (m && m.length > 1 && m.slice(1, m.length));
  else if (m.length <= 1)
    return;

  var params = {};

  if (m.length > 1)
    params = {};

  for (var i = 1, len = m.length, key, val; i < len; ++i) {
    key = keys[i - 1];
    val = decodeParam(m[i]);
    if (val === false)
      params[key.name] = val;
    else
      params[key.name] = m[i];
  }

  return params;
}

var RE_AT = /@/g;
function parseUrl(req) {
  var parsed = req._parsedUrl;
  if (parsed && parsed.href === req.url) {
    return parsed;
  } else {
    parsed = url.parse(req.url);

    if (parsed.auth && !parsed.protocol && ~parsed.href.indexOf('//')) {
      // This parses pathnames, and a strange pathname like //r@e should work
      parsed = url.parse(req.url.replace(RE_AT, '%40'));
    }

    return req._parsedUrl = parsed;
  }
}
