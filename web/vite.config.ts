// Proxy local API requests to the empty development service; run UI tests in jsdom.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://127.0.0.1:8787'}},test:{environment:'jsdom',setupFiles:['./src/test-setup.ts'],restoreMocks:true}});
