import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:'http://127.0.0.1:8000'},webServer:{command:'npm run build && python3 -m http.server 8000 --bind 127.0.0.1',port:8000},projects:[{name:'chromium',use:devices['Desktop Chrome']},{name:'firefox',use:devices['Desktop Firefox']},{name:'webkit',use:devices['Desktop Safari']}]});
