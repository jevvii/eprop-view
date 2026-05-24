import { runMigration } from '@/app/lib/migrate'

async function main() {
  const result = await runMigration()
  console.log(result.message)
  if (result.errors.length > 0) {
    console.error('Errors:', result.errors)
  }
  process.exit(result.success ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
