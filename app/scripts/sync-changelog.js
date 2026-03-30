import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const destinationPath = resolve(__dirname, "..", "public", "changelog.md");
const sourceCandidates = [
  resolve(__dirname, "..", "..", "CHANGELOG.md"),
  destinationPath,
];

const sourcePath = sourceCandidates.find((candidate) =>
  existsSync(candidate),
);

try {
  if (!sourcePath) {
    throw new Error(
      `No changelog source found. Checked: ${sourceCandidates.join(", ")}`,
    );
  }

  const changelog = readFileSync(sourcePath, "utf8");
  mkdirSync(dirname(destinationPath), { recursive: true });
  writeFileSync(destinationPath, changelog, "utf8");
  console.log(`Synced changelog from ${sourcePath} to ${destinationPath}`);
} catch (error) {
  console.error("Failed to sync changelog:", error.message);
  process.exit(1);
}
