const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'airline_database.json');

try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const nullLogos = [];

    for (const code in db) {
        if (db[code].logo === null) {
            nullLogos.push({ code, name: db[code].name });
        }
    }

    if (nullLogos.length > 0) {
        console.log(`Found ${nullLogos.length} airlines with null logos:`);
        nullLogos.forEach(airline => {
            console.log(`  - ${airline.code}: ${airline.name}`);
        });
    } else {
        console.log('No airlines with null logos found.');
    }

} catch (error) {
    console.error('Error processing airline database:', error.message);
}
