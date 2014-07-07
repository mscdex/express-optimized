Description
===========

A minimal, optimized version of Express.


Requirements
============

* [node.js](http://nodejs.org/) -- v0.10.0+


Install
=======

    npm install express-optimized


Supported Features
==================

**Anything not listed here is not implemented**

* Router -- This is the exported class. It is used just like the normal Express Router.

    * Functions

        * **handler** -- A request handler function that you can pass to http(s).createServer().
        * **use**([path], [callback...], callback) -- `path` can be a single path or an array of paths. `callback` can be a function or another Router. Chainable.
        * **all**([path], [callback...], callback) -- Aliased to `use()`.
        * **VERB**([path], [callback...], callback) -- Same as `use()` except specific to the particular HTTP verb.
        * **route**(path) -- Returns a Router instance that is mounted at `path`, relative to this router's path.
        * **param**(name, callback) -- Same as in Express except `name` is required.

    * Properties

        * **path** -- A string containing the base path of the router.

* Request object ([http.IncomingMessage](http://nodejs.org/docs/latest/api/http.html#http_http_incomingmessage))

    * Additional properties

        * **params** -- An object containing any/all route path parameters.
        * **query** -- An object containing any/all query parameters.
        * **path** -- A string containing the full requested path (minus query parameters).
        * **router** -- A reference to the Router instance handling this request.

* Response object ([http.ServerResponse](http://nodejs.org/docs/latest/api/http.html#http_class_http_serverresponse))

    * Additional properties

        * **router** -- A reference to the Router instance handling this request.
