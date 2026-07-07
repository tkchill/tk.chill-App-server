const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); 

let vatsimData = {
    liveData: {}, 
    history: {}   
};

function getDistanceNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchVatsim() {
    try {
        const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
        const parsed = await response.json();
        
        vatsimData.liveData = parsed; 
        
        const now = Date.now();
        const activeCids = new Set();

        if (parsed.pilots) {
            parsed.pilots.forEach(p => {
                const cid = p.cid.toString();
                activeCids.add(cid);

                if (!vatsimData.history[cid]) {
                    vatsimData.history[cid] = {
                        trail: [],
                        lastSeen: now
                    };
                }

                const hist = vatsimData.history[cid];
                hist.lastSeen = now; 

                const newPos = { lat: p.latitude, lng: p.longitude };
                
                if (hist.trail.length === 0) {
                    hist.trail.push(newPos);
                } else {
                    const lastPos = hist.trail[hist.trail.length - 1];
                    if (getDistanceNM(lastPos.lat, lastPos.lng, newPos.lat, newPos.lng) > 5) {
                        hist.trail.push(newPos);
                        if (hist.trail.length > 500) hist.trail.shift();
                    }
                }
            });
        }

        const THIRTY_MINUTES = 30 * 60 * 1000;
        Object.keys(vatsimData.history).forEach(cid => {
            if (!activeCids.has(cid)) {
                if (now - vatsimData.history[cid].lastSeen > THIRTY_MINUTES) {
                    delete vatsimData.history[cid];
                }
            }
        });

        console.log(`[${new Date().toISOString()}] Cập nhật thành công ${parsed.pilots?.length || 0} tàu bay.`);
    } catch (e) {
        console.error("Lỗi kéo data VATSIM:", e.message);
    }
}

setInterval(fetchVatsim, 15000);
fetchVatsim();

// 👉 SỬA LỖI "CANNOT GET /" CHO RENDERS
app.get('/', (req, res) => {
    res.send('<h1>Server Radar tk.chill đang chạy rầm rầm nhé! 🚀</h1><p>Data API ở địa chỉ: <a href="/api/traffic">/api/traffic</a></p>');
});

app.get('/api/traffic', (req, res) => {
    res.json(vatsimData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend Server đang chạy ở cổng ${PORT}`);
});
