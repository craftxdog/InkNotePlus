import './index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('InkNote root element is missing.');
}

root.dataset.inknoteCanvas = 'ready';
