function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

module.exports = function() {
  if (arguments.length === 0)
    return '';

  var isAbsPath = arguments[0].charAt(0) === '/',
      lastEl = arguments[arguments.length - 1],
      trailingSlash = lastEl[lastEl.length - 1] === '/',
      nonEmptySegments = [];

  // Normalize the path
  for (var i = 0, len = arguments.length, segment; i < len; ++i) {
    segment = arguments[i];
    if (segment) {
      if (segment.indexOf('/') > -1) {
        var subparts = segment.split('/');
        for (var j = 0, lenj = subparts.length; j < lenj; ++j)
          if (subparts[j])
            nonEmptySegments.push(subparts[j]);
      } else
        nonEmptySegments.push(segment);
    }
  }

  var path = normalizeArray(nonEmptySegments, !isAbsPath).join('/');

  if (!path && !isAbsPath) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsPath ? '/' : '') + path;
};
