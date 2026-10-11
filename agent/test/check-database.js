import { checkDatabaseConnection, prisma } from '../../server/models/prisma.js';
const result=await checkDatabaseConnection();
console.log(JSON.stringify({connected:result.connected}));
if(result.connected) {
  const rows=await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename IN ('users','endpoint_devices','endpoint_events')");
  console.log(JSON.stringify({tables:rows.map(r=>r.tablename)}));
}
await prisma.$disconnect();
