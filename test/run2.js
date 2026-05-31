const fs = require('fs');
const { buildKPIsFromCSV } = require('../lib/kpis.js');
const k = buildKPIsFromCSV(fs.readFileSync(__dirname+'/avance-progress.csv','utf8'));
console.log('KPIs:', JSON.stringify(k.kpis));
console.log('ESTATUS:', JSON.stringify(k.estatusActividades));
console.log('Hito Kick off:', JSON.stringify(k.hitos[0]));
console.log('Hito Soporteria:', JSON.stringify(k.hitos[1]));
console.log('Proximas[0..2]:', k.proximasActividades.slice(0,3).map(a=>a.nombre+' ['+a.estatus+']').join(' | '));
