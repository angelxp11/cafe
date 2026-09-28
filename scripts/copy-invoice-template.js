const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceTemplate = path.join(projectRoot, 'src/components/facturas/formato.html');
const sourceLogo = path.join(projectRoot, 'src/resources/images/image.png');
const publicDirectory = path.join(projectRoot, 'public/facturas');
const logoReference = '../../resources/images/image.png';
const template = readFileSync(sourceTemplate, 'utf8');

if (!template.includes(logoReference)) {
	throw new Error('No se encontró la ruta de logo esperada en formato.html.');
}

mkdirSync(publicDirectory, { recursive: true });
writeFileSync(path.join(publicDirectory, 'formato.html'), template.replace(/\.\.\/\.\.\/resources\/images\/image\.png/g, 'image.png'));
copyFileSync(sourceLogo, path.join(publicDirectory, 'image.png'));