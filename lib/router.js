var http = require('http'),
    qsparse = require('./querystring').parse,
    urljoin = require('./path-join'),
    util = require('util');

var pathRegex = require('path-to-regexp');

var EMPTY_PARAMS = {},
    STATUS_CODES = http.STATUS_CODES,
    ROUTES_MATCH_ALL = [ '' ],
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

  // [ regexp, pathkeys, handler(s) ]
  this._stack = [];

  this._paramFuncs = {};
  this._mounted = false;
  this._optimized = false;

  this.path = '/';

  this.handler = function routerHandlerWrap(req, res, cb) {
    self.handle(req, res, cb);
  };
}

Router.prototype.handle = function routerReqHandler(req, res, cb) {
  var stack = this._stack,
      stacklen = stack.length,
      ptr = 0,
      subPtr = 0,
      paramPtr = 0,
      paramsCache = {},
      paramFuncs = this._paramFuncs,
      urlpath = req.url,
      qm,
      pathname;

  //console.dir(this._stack);
  //var reqid = ''+Date.now();

  // req/res decorations
  if (!req.router) {
    qm = urlpath.indexOf('?');
    if (qm > -1) {
      req.path = urlpath.substring(0, qm);
      if (qm === urlpath.length - 1)
        req.query = {};
      else
        req.query = qsparse(urlpath.substring(qm + 1));
    } else {
      req.path = urlpath;
      req.query = {};
    }
  }
  pathname = req.path;
  req.router = res.router = this;
  // end req/res decorations

  function next(err) {
    var curmw,
        m,
        error,
        method = req.method,
        isHead = (method === 'HEAD');

    if (err !== undefined && err !== null) {
      if (util.isError(err))
        error = err;
      else if (typeof err === 'string') {
        error = new Error(err);
        error.code = err.code || this.DEFAULT_ERROR_STATUS;
      } else if (typeof err === 'number' && err >= 400 && err < 600) {
        error = new Error(method
                          + ' '
                          + pathname
                          + ' '
                          + (STATUS_CODES[err] || 'Unknown Error'));
        error.code = err;
      } else {
        error = new Error(method + ' ' + pathname + ' Unknown Error');
        error.code = this.DEFAULT_ERROR_STATUS;
      }
    }

    // TODO: optimize for compressed case to avoid having to execute the same
    // route regexp for every handler in the route's handlers array
    for (; ptr < stacklen; ++ptr, subPtr = 0, paramPtr = 0) {
      //console.log(reqid, 'ptr', ptr, 'subPtr', subPtr, 'stacklen', stacklen);
      curmw = stack[ptr];
      if (m = curmw[0].exec(pathname)) {
        var handlers = curmw[2],
            isMultiHandler = false,
            multiLen,
            handler;

        if (handlerMatches(handlers, method, error, isHead)) {
          handler = (typeof handlers === 'function'
                     ? handlers
                     : handlers.handler);
        } else if (handlers instanceof Array
                   && subPtr < (multiLen = handlers.length)) {
          // complex case, multiple handlers for this route path
          for (; subPtr < multiLen; ++subPtr) {
            if (handlerMatches(handlers[subPtr], method, error, isHead)) {
              handler = handlers[subPtr];
              if (typeof handler === 'object')
                handler = handler.handler;
              isMultiHandler = true;
              break;
            }
          }
        }

        if (!handler)
          continue;

        // check for `router.param('foo', cb);` calls before calling route
        // handler
        if (curmw[1] && curmw[1].length) {
          var resrc = curmw[0].toString();
          req.params = (paramsCache[resrc]
                        || (paramsCache[resrc] = makeParams(m, curmw[1])));
          var paramKeys = Object.keys(req.params);
          for (var lenk = paramKeys.length, fn; paramPtr < lenk; ++paramPtr) {
            if (fn = paramFuncs[paramKeys[paramPtr]])
              return fn(req, res, next, req.params[paramKeys[paramPtr++]]);
          }
        } else
          req.params = EMPTY_PARAMS;

        if (isMultiHandler)
          ++subPtr;
        else
          ++ptr;

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
    if (ptr === stacklen) {
      if (cb)
        cb(error);
      else if (error === undefined)
        res.end(method + ' ' + pathname + ' ' + STATUS_CODES[res.statusCode = 404]);
      else {
        res.statusCode = error.code;
        res.end(error.message);
      }
    }
  }

  next();
};
Router.prototype.DEFAULT_ERROR_STATUS = 500;

function handlerMatches(handler, method, error, isHead) {
  var ret = false,
      fn;
  if (typeof handler === 'function')
    fn = handler;
  else if (!(handler instanceof Array)
           && (method === handler.method
               || (isHead && handler.method === 'GET')))
    fn = handler.handler;

  if (fn && ((error === undefined && fn.length < 4)
             || (error !== undefined && fn.length === 4)))
    ret = true;

  return ret;
}

Router.prototype.use = function routerUse(route) {
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
    routes = ROUTES_MATCH_ALL;
  }

  if (!Array.isArray(routes))
    routes = [ routes ];

  for (var i = 0, len = routes.length, fullPath, regex, keys; i < len; ++i) {
    if (util.isRegExp(routes[i])) {
      keys = null;
      regex = routes[i];
    } else {
      keys = [];
      if (routes === ROUTES_MATCH_ALL) {
        fullPath = this.path;
        regex = pathRegex(fullPath, keys, { end: false });
      } else {
        fullPath = urljoin(this.path, routes[i]);
        regex = pathRegex(fullPath, keys);
      }
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

      this._stack.push([
        regex,
        keys,
        (method ? { method: method, handler: handlerfn } : handlerfn)
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

      case 3:
        return this.use(route, handler, arguments[2], method);

      case 4:
        return this.use(route, handler, arguments[2], arguments[3], method);

      case 5:
        return this.use(route,
                        handler,
                        arguments[2],
                        arguments[3],
                        arguments[4],
                        method);

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

Router.prototype.compress = function() {
  // Call this to compress the current middleware stack. Specifically it
  // combines route handlers for the same route paths to avoid having to call
  // the same regular expressions multiple times.

  // This should only be called before you start serving requests because it
  // modifies the middleware stack and that could mess things up if a request
  // is currently in progress.

  if (this._optimized)
    return;

  var general_path = pathRegex(this.path, [], { end: false });

  var stack = this._stack,
      newStack = [],
      isGeneral = false,
      len = stack.length,
      i,
      layer;

  // first pass, collecting unique non-general route paths
  for (i = 0; i < len; ++i) {
    isGeneral = (regexpsEqual(stack[i][0], general_path)
                 && typeof stack[i][2] === 'function');
    if (!isGeneral) {
      if (!getNewPath(stack[i][0]))
        newStack.push(stack[i]);
    }
  }

  if (newStack.length) {
    // second pass, copying general route handlers to non-general routes
    for (i = 0; i < len; ++i) {
      isGeneral = (regexpsEqual(stack[i][0], general_path)
                   && typeof stack[i][2] === 'function');
      if (isGeneral) {
        // append to all non-general routes
        var handler = stack[i][2];
        for (var j = 0, newlen = newStack.length; j < newlen; ++j) {
          if (newStack[j][2] instanceof Array)
            newStack[j][2].push(handler);
          else
            newStack[j][2] = [ newStack[j][2], handler ];
        }
      } else {
        // we have a non-general route to append
        layer = getNewPath(stack[i][0]);
        if (layer[2] === stack[i][2]) {
          // this was the original route we captured in the first pass, so skip
          // it
          continue;
        }
        if (layer[2] instanceof Array)
          layer[2].push(stack[i][2]);
        else
          layer[2] = [ layer[2], stack[i][2] ];
      }
    }
  } else if (len) {
    // the stack consists only of general middleware, so just keep combine
    // entire stack into one layer
    newStack.push(layer = stack[0]);
    for (i = 1; i < len; ++i) {
      if (layer[2] instanceof Array)
        layer[2].push(stack[i][2]);
      else
        layer[2] = [ layer[2], stack[i][2] ];
    }
  }

  this._stack = newStack;

  this._optimized = true;

  function getNewPath(path) {
    for (var j = 0, newlen = newStack.length; j < newlen; ++j)
      if (regexpsEqual(path, newStack[j][0]))
        return newStack[j];
  }
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

function regexpsEqual(re1, re2) {
  return (re1.source === re2.source
          && re1.global === re2.global
          && re1.ignoreCase === re2.ignoreCase
          && re1.multiline === re2.multiline);
}
