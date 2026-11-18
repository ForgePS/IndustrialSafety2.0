function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var incidentMatch = uri.match(/^\/incidents\/([^/]+)\/?$/);
  if (incidentMatch) {
    var segment = incidentMatch[1];
    if (segment !== 'new' && segment !== 'placeholder') {
      request.uri = '/incidents/placeholder/index.html';
      return request;
    }
  }
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.length > 1 && uri.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
