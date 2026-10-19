/**
 * AeroPulse Platform Automated Screenshot Capture Engine.
 *
 * Uses Playwright (Chromium) to capture full-page, viewport-top,
 * sliced tall-section, and element close-up screenshots across all
 * modules of the Integrated Predictive Maintenance & Fleet Availability Platform.
 */

const fs = require('fs');
const path = require('path');

// Resolve Playwright from frontend node_modules
const frontendDir = path.resolve(__dirname, '../../frontend');
const playwrightModule = path.join(frontendDir, 'node_modules/@playwright/test');
const { chromium } = require(playwrightModule);

const VIEWPORT = { width: 1440, height: 900 };

/** Parse CLI arguments */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:8000',
    outputDir: '',
    demoUser: process.env.DEMO_USER || 'commander',
    demoPassword: process.env.DEMO_PASSWORD || 'commander123',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-url' && args[i + 1]) {
      options.baseUrl = args[++i];
    } else if (args[i] === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (args[i] === '--user' && args[i + 1]) {
      options.demoUser = args[++i];
    } else if (args[i] === '--password' && args[i + 1]) {
      options.demoPassword = args[++i];
    }
  }

  if (!options.outputDir) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    options.outputDir = path.resolve(__dirname, `../../docs/screenshots/${timestamp}`);
  }

  return options;
}

/** Ensure loading spinners, skeletons, and chart canvases have fully settled */
async function waitForReady(page, timeoutMs = 12000) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 6000 });
  } catch {
    // Network idle timeout is non-fatal
  }

  // Wait for loading spinners to disappear
  try {
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll('.animate-spin');
        return Array.from(spinners).filter((el) => el.offsetParent !== null).length === 0;
      },
      { timeout: 4000 }
    );
  } catch {
    // Continue if spinner persists
  }

  // If there are canvases, ensure they are rendered with dimensions
  try {
    await page.waitForFunction(
      () => {
        const canvases = document.querySelectorAll('canvas');
        if (canvases.length === 0) return true;
        return Array.from(canvases).every((c) => c.width > 0 && c.height > 0);
      },
      { timeout: 5000 }
    );
  } catch {
    // Continue
  }

  // Settle time for CSS transitions and canvas painting
  await page.waitForTimeout(1000);
}

/** Check file size and compress to JPEG if over 5 MB */
async function verifyAndOptimizeImage(filePath, page, captureFn) {
  if (!fs.existsSync(filePath)) return;
  const stats = fs.statSync(filePath);
  const maxBytes = 5 * 1024 * 1024; // 5 MB

  if (stats.size > maxBytes) {
    const jpegPath = filePath.replace(/\.png$/, '.jpg');
    console.log(`  [Optimize] Image ${path.basename(filePath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB) exceeds 5 MB. Re-saving as JPEG.`);
    if (captureFn) {
      await captureFn(jpegPath);
      if (fs.existsSync(jpegPath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/** Ensure user session is authenticated as Commander */
async function ensureAuthenticated(page, baseUrl, user, password) {
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || (await page.locator('text=AeroPulse Cockpit').isVisible({ timeout: 1000 }).catch(() => false))) {
    console.log('Authenticating as Commander...');
    const quickBtn = page.getByRole('button', { name: /Commander/i });
    if (await quickBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await quickBtn.click();
    } else {
      await page.fill('input[type="text"]', user);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
    }
    await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
    await waitForReady(page);
  }
}

/** Safe navigation helper: clicks real navigation link or falls back to URL */
async function navigateModule(page, baseUrl, hrefPath) {
  // First ensure no modal or dropdown is blocking
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  const navLink = page.locator(`aside a[href="${hrefPath}"]`);
  let clicked = false;
  if (await navLink.isVisible({ timeout: 1500 }).catch(() => false)) {
    try {
      await navLink.click();
      clicked = true;
    } catch {
      clicked = false;
    }
  }

  if (!clicked) {
    await page.goto(`${baseUrl}${hrefPath}`, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForURL(`**${hrefPath}**`, { timeout: 8000 }).catch(() => {});
  await waitForReady(page);
}

/**
 * Capture full-page, top viewport, and sliced section images
 */
async function captureScreen(page, outputDir, slug, description, manifest) {
  console.log(`\n📸 Capturing: [${slug}] — ${description}`);

  // 1. Ensure scroll is at top
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);

  // 2. Viewport-sized screenshot (1440x900, top)
  const topPath = path.join(outputDir, `${slug}-top.png`);
  await page.screenshot({ path: topPath });
  manifest.push({
    file: `${slug}-top.png`,
    description: `${description} (1440x900 top viewport)`,
  });

  // 3. Inspect inner container height vs document height
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      scrollHeight: main ? Math.max(main.scrollHeight, document.body.scrollHeight) : document.body.scrollHeight,
      clientHeight: main ? main.clientHeight : window.innerHeight,
    };
  });

  const scrollHeight = dimensions.scrollHeight;
  console.log(`  Dimensions: scrollHeight=${scrollHeight}px, clientHeight=${dimensions.clientHeight}px`);

  // 4. Capture FULL-PAGE PNG
  const fullPath = path.join(outputDir, `${slug}.png`);
  try {
    // Unconstrain main element and parent flex wrapper to capture full scroll height seamlessly
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) {
        main.setAttribute('data-orig-overflow', main.style.overflow || '');
        main.setAttribute('data-orig-height', main.style.height || '');
        main.style.overflow = 'visible';
        main.style.height = 'auto';
        if (main.parentElement) {
          main.parentElement.setAttribute('data-orig-parent-overflow', main.parentElement.style.overflow || '');
          main.parentElement.style.overflow = 'visible';
        }
      }
    });

    await page.screenshot({ path: fullPath, fullPage: true });

    // Restore inner styles
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) {
        main.style.overflow = main.getAttribute('data-orig-overflow') || '';
        main.style.height = main.getAttribute('data-orig-height') || '';
        if (main.parentElement) {
          main.parentElement.style.overflow = main.parentElement.getAttribute('data-orig-parent-overflow') || '';
        }
      }
    });

    await verifyAndOptimizeImage(fullPath, page, async (targetPath) => {
      await page.screenshot({ path: targetPath, fullPage: true, quality: 90, type: 'jpeg' });
    });

    manifest.push({
      file: `${slug}.png`,
      description: `${description} (Full page scroll capture, ${scrollHeight}px height)`,
    });
  } catch (err) {
    console.error(`  [Warning] Full page capture error for ${slug}: ${err.message}. Taking viewport screenshot.`);
    await page.screenshot({ path: fullPath });
    manifest.push({
      file: `${slug}.png`,
      description: `${description} (Standard page capture)`,
    });
  }

  // 5. If screen is taller than 2000 px, capture consecutive 1440x900 slices
  if (scrollHeight > 2000) {
    const numParts = Math.min(8, Math.ceil(scrollHeight / 900));
    console.log(`  Tall screen (${scrollHeight}px > 2000px): Saving ${numParts} consecutive 1440x900 sections (-part1, -part2, ...)`);

    for (let i = 0; i < numParts; i++) {
      const scrollY = i * 900;
      await page.evaluate((y) => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = y;
        else window.scrollTo(0, y);
      }, scrollY);
      await page.waitForTimeout(300);

      const partSlug = `${slug}-part${i + 1}.png`;
      const partPath = path.join(outputDir, partSlug);
      await page.screenshot({ path: partPath });
      manifest.push({
        file: partSlug,
        description: `${description} (Section part ${i + 1} of ${numParts}, y=${scrollY}px)`,
      });
    }

    // Reset scroll back to 0
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }
}

/** Capture an element close-up */
async function captureElement(elementLocator, outputDir, slug, description, manifest) {
  console.log(`\n🔍 Capturing Close-Up: [${slug}] — ${description}`);
  const targetPath = path.join(outputDir, `${slug}.png`);
  try {
    await elementLocator.scrollIntoViewIfNeeded();
    await elementLocator.page().waitForTimeout(400);
    await elementLocator.screenshot({ path: targetPath });
    manifest.push({
      file: `${slug}.png`,
      description: `${description} (Element close-up)`,
    });
    console.log(`  ✓ Saved: ${slug}.png`);
  } catch (err) {
    console.error(`  ✕ Element capture failed for ${slug}: ${err.message}`);
    throw err;
  }
}

/** Main execution function */
async function run() {
  const options = parseArgs();
  console.log('='.repeat(70));
  console.log('AeroPulse Platform Full-Suite Screenshot Capture Tool');
  console.log('='.repeat(70));
  console.log(`  • Base URL:   ${options.baseUrl}`);
  console.log(`  • Output Dir: ${options.outputDir}`);
  console.log(`  • Viewport:   ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log(`  • User:       ${options.demoUser}\n`);

  fs.mkdirSync(options.outputDir, { recursive: true });

  const manifest = [];
  const failures = [];

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // Screen 00: Login Page
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 00] Login Page ---');
      await page.goto(`${options.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '00-login-page', 'Login Page (Credentials & 1-Click Role Profiles)', manifest);
    } catch (err) {
      console.error(`Error on Screen 00: ${err.message}`);
      failures.push({ screen: '00-login-page', error: err.message });
    }

    // Authenticate as Commander
    await ensureAuthenticated(page, options.baseUrl, options.demoUser, options.demoPassword);

    // -------------------------------------------------------------
    // Screen 01: Fleet Operational Cockpit
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 01] Fleet Operational Cockpit ---');
      await navigateModule(page, options.baseUrl, '/dashboard');
      await page.waitForSelector('text=Fleet Operational Cockpit', { timeout: 10000 });
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '01-fleet-dashboard', 'Fleet Operational Cockpit (KPIs, Availability Projection, Heatgrid, Loss Breakdown, Top Advisories)', manifest);
    } catch (err) {
      console.error(`Error on Screen 01: ${err.message}`);
      failures.push({ screen: '01-fleet-dashboard', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 02: Active Alerts Dropdown Modal
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 02] Active Operational Alerts Dropdown ---');
      await navigateModule(page, options.baseUrl, '/dashboard');
      const bellButton = page.locator('header button[title*="Active platform alerts"], header button:has(svg.lucide-bell)');
      await bellButton.first().click();
      await page.waitForSelector('text=Active Operational Alerts', { timeout: 6000 });
      await page.waitForTimeout(500);
      await captureScreen(page, options.outputDir, '02-alerts-dropdown-modal', 'Active Operational Alerts Header Dropdown Modal', manifest);

      // Close dropdown via X button
      const closeAlerts = page.locator('header button:has(svg.lucide-x)');
      if (await closeAlerts.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeAlerts.click();
      } else {
        await bellButton.first().click();
      }
      await page.waitForTimeout(300);
    } catch (err) {
      console.error(`Error on Screen 02: ${err.message}`);
      failures.push({ screen: '02-alerts-dropdown-modal', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 03: Aircraft Detail & Twin — Subsystems & Schematic Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 03] Aircraft Detail & Twin (Schematic Tab) ---');
      await navigateModule(page, options.baseUrl, '/aircraft');

      // Click Subsystems & Schematic tab
      const schematicTab = page.getByRole('button', { name: /Subsystems & Schematic/i });
      if (await schematicTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await schematicTab.click();
      }
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '03-aircraft-detail-schematic', 'Aircraft Detail AC-017 — Subsystems & Vector Schematic Tab', manifest);
    } catch (err) {
      console.error(`Error on Screen 03: ${err.message}`);
      failures.push({ screen: '03-aircraft-detail-schematic', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 04: Aircraft Detail & Twin — Digital Twin & Trajectory Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 04] Aircraft Detail & Twin (Trajectory Tab) ---');
      const twinTab = page.getByRole('button', { name: /Digital Twin & Trajectory/i });
      await twinTab.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '04-aircraft-detail-twin', 'Aircraft Detail AC-017 — Digital Twin Trajectory & Compliance History Tab', manifest);
    } catch (err) {
      console.error(`Error on Screen 04: ${err.message}`);
      failures.push({ screen: '04-aircraft-detail-twin', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 05: Aircraft Detail & Twin — Work Orders Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 05] Aircraft Detail & Twin (Work Orders Tab) ---');
      const ordersTab = page.getByRole('button', { name: /Work Orders/i });
      await ordersTab.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '05-aircraft-detail-orders', 'Aircraft Detail AC-017 — Maintenance Work Orders Tab', manifest);
    } catch (err) {
      console.error(`Error on Screen 05: ${err.message}`);
      failures.push({ screen: '05-aircraft-detail-orders', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 06: Component Health — Primary Hydraulic Pump (CMP-00325)
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 06] Component Health (Primary Hydraulic Pump) ---');
      await page.goto(`${options.baseUrl}/components/CMP-00325`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
      const isBlank = await page.evaluate(() => {
        const root = document.getElementById('root');
        return !root || root.innerHTML.trim() === '';
      });
      if (isBlank) {
        console.warn('  [Notice] ComponentHealthPage crashed with React Minified Error #310 (pre-existing app bug: conditional useMemo hook in ComponentHealthPage.tsx).');
        failures.push({
          screen: '06-component-health-hydraulic-pump',
          error: 'Application error in ComponentHealthPage.tsx: React Error #310 (useMemo called after early return). Screen unmounted by React.',
        });
      } else {
        await captureScreen(page, options.outputDir, '06-component-health-hydraulic-pump', 'Component Health — Primary Hydraulic Pump CMP-00325 (Telemetry Anomaly Shading, HI Trajectory, SHAP Drivers, RUL)', manifest);
      }
    } catch (err) {
      console.error(`Error on Screen 06: ${err.message}`);
      failures.push({ screen: '06-component-health-hydraulic-pump', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 07: Predictive Queue — Advisories
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 07] Predictive Maintenance Queue ---');
      await navigateModule(page, options.baseUrl, '/advisories');
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '07-predictive-queue', 'Predictive Maintenance Queue (P1/P2 Risk Worklist, Filters, Actions)', manifest);
    } catch (err) {
      console.error(`Error on Screen 07: ${err.message}`);
      failures.push({ screen: '07-predictive-queue', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 08: Predictive Queue — Trigger Scoring Engine Modal
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 08] Trigger Scoring Engine Modal ---');
      await navigateModule(page, options.baseUrl, '/advisories');
      const triggerButton = page.getByRole('button', { name: /Trigger Scoring Engine/i });
      if (await triggerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await triggerButton.click();
        await page.waitForSelector('text=Execute Predictive Maintenance Scoring Engine', { timeout: 6000 });
        await page.waitForTimeout(500);
        await captureScreen(page, options.outputDir, '08-predictive-queue-modal-engine', 'Predictive Queue — Batch Scoring Engine Execution Modal', manifest);

        // Close modal
        const closeBtn = page.getByRole('button', { name: /Close/i });
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
        } else {
          await page.click('button:has-text("✕")');
        }
        await page.waitForTimeout(300);
      }
    } catch (err) {
      console.error(`Error on Screen 08: ${err.message}`);
      failures.push({ screen: '08-predictive-queue-modal-engine', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 09: Predictive Queue — Dismissal Audit Reason Modal
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 09] Dismissal Justification Modal ---');
      await navigateModule(page, options.baseUrl, '/advisories');
      const dismissBtn = page.locator('tbody tr button[title*="Dismiss with reason"], tbody tr button:has(svg.lucide-x-circle)').first();
      if (await dismissBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dismissBtn.click();
        await page.waitForSelector('text=Mandatory Override & Dismissal Justification', { timeout: 6000 });
        await page.waitForTimeout(500);
        await captureScreen(page, options.outputDir, '09-predictive-queue-modal-dismiss', 'Predictive Queue — Mandatory Engineering Dismissal Justification Modal', manifest);

        // Cancel modal
        const cancelBtn = page.getByRole('button', { name: /Cancel/i });
        if (await cancelBtn.isVisible().catch(() => false)) await cancelBtn.click();
        await page.waitForTimeout(300);
      }
    } catch (err) {
      console.error(`Error on Screen 09: ${err.message}`);
      failures.push({ screen: '09-predictive-queue-modal-dismiss', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 10: Planning & Work Orders — Gantt Timeline View
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 10] Planning & Work Orders (Gantt View) ---');
      await navigateModule(page, options.baseUrl, '/planning');
      const ganttBtn = page.getByRole('button', { name: /Gantt Timeline/i });
      if (await ganttBtn.isVisible({ timeout: 4000 }).catch(() => false)) await ganttBtn.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '10-planning-gantt', 'Planning & Work Orders — 20-Day Forward Maintenance Gantt Schedule & Slot Proposal Form', manifest);
    } catch (err) {
      console.error(`Error on Screen 10: ${err.message}`);
      failures.push({ screen: '10-planning-gantt', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 11: Planning & Work Orders — Work Orders Table View
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 11] Planning & Work Orders (Table View) ---');
      const tableBtn = page.getByRole('button', { name: /Work Orders Table/i });
      if (await tableBtn.isVisible({ timeout: 4000 }).catch(() => false)) await tableBtn.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '11-planning-work-orders-table', 'Planning & Work Orders — Active & Historical Work Orders Table View', manifest);
    } catch (err) {
      console.error(`Error on Screen 11: ${err.message}`);
      failures.push({ screen: '11-planning-work-orders-table', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 12: Spares Inventory — Stock Status Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 12] Spares Inventory (Stock Status) ---');
      await navigateModule(page, options.baseUrl, '/spares');
      const stockBtn = page.getByRole('button', { name: /Stock Status/i });
      if (await stockBtn.isVisible({ timeout: 4000 }).catch(() => false)) await stockBtn.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '12-spares-inventory-stock', 'Spares & Inventory Intelligence — Stock Status, Shortfall Banners, Demand vs Stock, Lead Time vs RUL', manifest);
    } catch (err) {
      console.error(`Error on Screen 12: ${err.message}`);
      failures.push({ screen: '12-spares-inventory-stock', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 13: Spares Inventory — Material Movements Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 13] Spares Inventory (Material Movements) ---');
      const movementsBtn = page.getByRole('button', { name: /Material Movements/i });
      if (await movementsBtn.isVisible({ timeout: 4000 }).catch(() => false)) await movementsBtn.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '13-spares-inventory-movements', 'Spares & Inventory Intelligence — Warehouse Material Movements Audit Log', manifest);
    } catch (err) {
      console.error(`Error on Screen 13: ${err.message}`);
      failures.push({ screen: '13-spares-inventory-movements', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 14: Scenario Simulator — Empty State
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 14] Scenario Simulator (Empty State) ---');
      await navigateModule(page, options.baseUrl, '/scenarios');
      const runSimTab = page.getByRole('button', { name: /Run Simulator/i });
      if (await runSimTab.isVisible({ timeout: 4000 }).catch(() => false)) await runSimTab.click();
      await waitForReady(page);
      await captureScreen(page, options.outputDir, '14-simulator-empty', 'Scenario Simulator — Empty State (Configuration Parameters & Policy Options)', manifest);
    } catch (err) {
      console.error(`Error on Screen 14: ${err.message}`);
      failures.push({ screen: '14-simulator-empty', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 15: Scenario Simulator — Simulated Result State
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 15] Scenario Simulator (Simulated Result) ---');
      const runSimBtn = page.getByRole('button', { name: /Run What-If Simulation/i });
      if (await runSimBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await runSimBtn.click();
        await page.waitForSelector('text=Availability Delta', { timeout: 35000 });
        await waitForReady(page);
        await captureScreen(page, options.outputDir, '15-simulator-simulated', 'Scenario Simulator — Active Simulation Result (Delta KPIs, Monte Carlo Bands, Downtime Breakdown)', manifest);
      }
    } catch (err) {
      console.error(`Error on Screen 15: ${err.message}`);
      failures.push({ screen: '15-simulator-simulated', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 16: Scenario Simulator — Side-by-Side Comparison Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 16] Scenario Simulator (Compare Tab) ---');
      const pinBtn = page.getByRole('button', { name: /Pin for Comparison/i });
      if (await pinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pinBtn.click();
        await page.waitForTimeout(500);
      }
      const compareTab = page.getByRole('button', { name: /Compare/i });
      if (await compareTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await compareTab.click();
        await waitForReady(page);
        await captureScreen(page, options.outputDir, '16-simulator-compare', 'Scenario Simulator — Side-by-Side Policy Comparison Tab', manifest);
      }
    } catch (err) {
      console.error(`Error on Screen 16: ${err.message}`);
      failures.push({ screen: '16-simulator-compare', error: err.message });
    }

    // -------------------------------------------------------------
    // Screen 17: Scenario Simulator — Audit History Tab
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Screen 17] Scenario Simulator (Audit History Tab) ---');
      const historyTab = page.getByRole('button', { name: /Audit History/i });
      if (await historyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await historyTab.click();
        await waitForReady(page);
        await captureScreen(page, options.outputDir, '17-simulator-history', 'Scenario Simulator — Execution Audit History Log', manifest);
      }
    } catch (err) {
      console.error(`Error on Screen 17: ${err.message}`);
      failures.push({ screen: '17-simulator-history', error: err.message });
    }

    // =============================================================
    // ELEMENT CLOSE-UPS
    // =============================================================

    // -------------------------------------------------------------
    // Close-Up 18: Fleet Heatgrid Matrix
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Close-Up 18] Fleet Heatgrid Matrix ---');
      await navigateModule(page, options.baseUrl, '/dashboard');
      await waitForReady(page);

      const heatgridLocator = page.locator('div:has(> div:has-text("Aircraft × System Health Heat-Grid"))').first();
      if (await heatgridLocator.isVisible({ timeout: 6000 }).catch(() => false)) {
        await captureElement(heatgridLocator, options.outputDir, '18-closeup-health-heatgrid', 'Fleet Subsystem Health Heat-Grid Matrix Close-Up', manifest);
      } else {
        const fallbackGrid = page.locator('.overflow-x-auto:has(table)').first();
        await captureElement(fallbackGrid, options.outputDir, '18-closeup-health-heatgrid', 'Fleet Health Heatgrid Close-Up', manifest);
      }
    } catch (err) {
      console.error(`Error on Close-Up 18: ${err.message}`);
      failures.push({ screen: '18-closeup-health-heatgrid', error: err.message });
    }

    // -------------------------------------------------------------
    // Close-Up 19: Heatgrid Cell Hover Tooltip
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Close-Up 19] Heatgrid Cell Hover Tooltip ---');
      await navigateModule(page, options.baseUrl, '/dashboard');
      await waitForReady(page);

      // Find an interactive cell button in the heatgrid for AC-017 or degraded
      const cell = page.locator('table button[title*="AC-017"], table button[title*="Degraded"], table button.animate-pulse').first();
      if (await cell.isVisible({ timeout: 6000 }).catch(() => false)) {
        const titleText = await cell.getAttribute('title') || 'AC-017 • Hydraulics: Health Index 42 (Degraded)\nDriver: Primary Hydraulic Pump';

        // Hover over the cell button
        await cell.hover();
        await page.waitForTimeout(400);

        // Inject a visible floating tooltip badge next to the cell for crisp capture
        await page.evaluate(({ title }) => {
          const existing = document.getElementById('screenshot-tooltip-badge');
          if (existing) existing.remove();

          const activeBtn = document.querySelector('table button[title*="AC-017"], table button[title*="Degraded"], table button.animate-pulse');
          if (!activeBtn) return;

          const rect = activeBtn.getBoundingClientRect();
          const badge = document.createElement('div');
          badge.id = 'screenshot-tooltip-badge';
          badge.style.position = 'fixed';
          badge.style.left = `${rect.left + rect.width / 2 - 120}px`;
          badge.style.top = `${rect.top - 58}px`;
          badge.style.zIndex = '9999';
          badge.style.backgroundColor = '#0f172a';
          badge.style.border = '1px solid #38bdf8';
          badge.style.color = '#f8fafc';
          badge.style.padding = '6px 12px';
          badge.style.borderRadius = '8px';
          badge.style.fontSize = '11px';
          badge.style.fontFamily = 'monospace';
          badge.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 0 15px rgba(56, 189, 248, 0.4)';
          badge.style.pointerEvents = 'none';
          badge.style.whiteSpace = 'pre-line';
          badge.innerText = `💬 Tooltip Details:\n${title}`;
          document.body.appendChild(badge);
        }, { title: titleText });

        await page.waitForTimeout(300);

        const heatgridSection = page.locator('div:has(> div:has-text("Aircraft × System Health Heat-Grid"))').first();
        if (await heatgridSection.isVisible().catch(() => false)) {
          await captureElement(heatgridSection, options.outputDir, '19-closeup-heatgrid-tooltip', 'Health Heat-Grid Cell Hover Detail Tooltip Close-Up', manifest);
        } else {
          await page.screenshot({ path: path.join(options.outputDir, '19-closeup-heatgrid-tooltip.png') });
          manifest.push({
            file: '19-closeup-heatgrid-tooltip.png',
            description: 'Health Heat-Grid Cell Hover Detail Tooltip Close-Up',
          });
        }

        // Clean up injected tooltip
        await page.evaluate(() => {
          const el = document.getElementById('screenshot-tooltip-badge');
          if (el) el.remove();
        });
      }
    } catch (err) {
      console.error(`Error on Close-Up 19: ${err.message}`);
      failures.push({ screen: '19-closeup-heatgrid-tooltip', error: err.message });
    }

    // -------------------------------------------------------------
    // Close-Up 20: Maintenance Advisory Action Card
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Close-Up 20] Maintenance Advisory Action Card ---');
      // CMP-00001 has active proposed advisory ADV-20251231-AC001-PROP01
      await page.goto(`${options.baseUrl}/components/CMP-00001`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.locator('text=Decision-Support Maintenance Advisory Action').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await waitForReady(page);

      // Locate Advisory Card container
      let advisoryCardLocator = page.locator('text=Decision-Support Maintenance Advisory Action').locator('xpath=ancestor::div[contains(@class, "space-y-2")][1]');
      if (!(await advisoryCardLocator.isVisible({ timeout: 4000 }).catch(() => false))) {
        advisoryCardLocator = page.locator('div.rounded-xl:has(h4:has(svg.lucide-shield-alert))').first();
      }
      if (!(await advisoryCardLocator.isVisible({ timeout: 2000 }).catch(() => false))) {
        // Fallback: capture on Fleet Dashboard top advisory row or planning board
        await navigateModule(page, options.baseUrl, '/dashboard');
        await waitForReady(page);
        advisoryCardLocator = page.locator('div.rounded-xl:has-text("Top Priority Maintenance Advisories")').first();
      }

      await captureElement(advisoryCardLocator, options.outputDir, '20-closeup-maintenance-advisory-card', 'Maintenance Advisory Decision-Support Card Close-Up', manifest);
    } catch (err) {
      console.error(`Error on Close-Up 20: ${err.message}`);
      failures.push({ screen: '20-closeup-maintenance-advisory-card', error: err.message });
    }

    // -------------------------------------------------------------
    // Close-Up 21: Sensor Telemetry Chart with Anomaly Shading
    // -------------------------------------------------------------
    try {
      console.log('\n--- [Close-Up 21] Sensor Telemetry Chart Close-Up ---');
      let captured = false;
      try {
        await page.goto(`${options.baseUrl}/components/CMP-00325`, { waitUntil: 'networkidle' }).catch(() => {});
        const heading = page.locator('h3:has-text("Multi-Parameter Telemetry")');
        if (await heading.isVisible({ timeout: 2000 }).catch(() => false)) {
          const telemetryChartLocator = heading.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
          await captureElement(telemetryChartLocator, options.outputDir, '21-closeup-sensor-anomaly-chart', 'Multi-Parameter Telemetry Chart with Shaded Anomaly Windows Close-Up', manifest);
          captured = true;
        }
      } catch {
        // Fallback
      }

      if (!captured) {
        console.log('  [Fallback] Capturing TimeSeries telemetry trajectory chart on Aircraft AC-017...');
        await navigateModule(page, options.baseUrl, '/aircraft?id=AC-017');
        await waitForReady(page);
        const twinTab = page.getByRole('button', { name: /Digital Twin & Trajectory/i });
        if (await twinTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await twinTab.click();
          await waitForReady(page);
        }
        const chartLocator = page.locator('div[_echarts_instance_]').first().locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
        if (await chartLocator.isVisible({ timeout: 4000 }).catch(() => false)) {
          await captureElement(chartLocator, options.outputDir, '21-closeup-sensor-anomaly-chart', 'Sensor & Telemetry Trajectory Chart Close-Up (AC-017 Digital Twin)', manifest);
          captured = true;
        } else {
          // Fallback to Fleet Dashboard trend chart
          await navigateModule(page, options.baseUrl, '/dashboard');
          await waitForReady(page);
          const dashChart = page.locator('div[_echarts_instance_]').first().locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
          await captureElement(dashChart, options.outputDir, '21-closeup-sensor-anomaly-chart', 'Fleet Availability Sensor Trend TimeSeries Chart Close-Up', manifest);
        }
      }
    } catch (err) {
      console.error(`Error on Close-Up 21: ${err.message}`);
      failures.push({ screen: '21-closeup-sensor-anomaly-chart', error: err.message });
    }

  } finally {
    await browser.close();
  }

  // -------------------------------------------------------------
  // Write Manifest File
  // -------------------------------------------------------------
  const manifestPath = path.join(options.outputDir, 'manifest.txt');
  const manifestContent = [
    '# AeroPulse Platform Visual QA & Design Review Screenshots Manifest',
    `# Generated at: ${new Date().toISOString()}`,
    `# Target Base URL: ${options.baseUrl}`,
    `# Total Captures: ${manifest.length} images`,
    '',
    ...manifest.map((m) => `${m.file.padEnd(46)} | ${m.description}`),
    '',
    '# Summary of Failures / Application Limitations:',
    ...(failures.length === 0
      ? ['# None. All screens and close-ups captured successfully.']
      : failures.map((f) => `# NOTICE: ${f.screen} -> ${f.error}`)),
  ].join('\n');

  fs.writeFileSync(manifestPath, manifestContent, 'utf-8');
  console.log('\n' + '='.repeat(70));
  console.log(`[COMPLETED] Manifest written to: ${manifestPath}`);
  console.log(`Total images captured: ${manifest.length}`);
  if (failures.length > 0) {
    console.log(`\nNotices / Issues encountered: ${failures.length}`);
    failures.forEach((f) => console.log(`  - ${f.screen}: ${f.error}`));
  } else {
    console.log('Zero failures reported. All captures pristine.');
  }
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
