const fabric = require('fabric').fabric;

const img = new fabric.Image('', { width: 100, height: 100 });
const clipRect = new fabric.Rect({
    originX: 'left',
    originY: 'top',
    left: -50,
    top: -50,
    width: 50,
    height: 100,
});
img.set({ clipPath: clipRect });
console.log(img.clipPath.left);
