const output = document.getElementById('output');

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function buildItem() {
  const tags = getValue('tags')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  return {
    type: getValue('type'),
    title: getValue('title'),
    href: getValue('href'),
    image: getValue('image'),
    summary: getValue('summary'),
    tags
  };
}

document.getElementById('generate').addEventListener('click', () => {
  const item = buildItem();
  output.textContent = JSON.stringify(item, null, 2);
});

document.getElementById('download').addEventListener('click', () => {
  const item = buildItem();

  // load existing items.json if possible
  fetch('data/items.json')
    .then(r => r.json())
    .then(data => {
      data.push(item);
      const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'items.json';
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {
      // fallback: download only the single item
      const blob = new Blob(
        [JSON.stringify(item, null, 2)],
        { type: 'application/json' }
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'item.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
});
