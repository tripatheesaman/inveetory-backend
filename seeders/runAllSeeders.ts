import { exec } from 'child_process';

function runSeeder(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\nRunning: ${script}`);
    exec(`npx ts-node seeders/${script}`, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (error) {
        console.error(`Error running ${script}:`, error);
        reject(error);
      } else {
        console.log(`Finished: ${script}`);
        resolve();
      }
    });
  });
}

async function runAllSeeders() {
  try {
    await runSeeder('seeder.ts');
    await runSeeder('seedRoles.ts');
    await runSeeder('seedConfig.ts');
    await runSeeder('seedUsers.ts');
    await runSeeder('seedPermissions.ts');
    await runSeeder('updateRolePermissions.ts');
    console.log('\nAll seeders completed successfully!');
  } catch (error) {
    console.error('Seeding process failed:', error);
  }
}

runAllSeeders(); 