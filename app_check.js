const fs = require('fs');
const js = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const regex = /getElementById\(['"]([^'"]+)['"]\)(\??)\.addEventListener/g;
let match;
while ((match = regex.exec(js)) !== null) {
  const id = match[1];
  const optional = match[2];
  if (!optional && !html.includes('id=\"' + id + '\"') && !html.includes(\"id='\" + id + \"'\")) {
    console.log('Missing: ' + id);
  }
}
