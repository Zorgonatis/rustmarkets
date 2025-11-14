# Market Tracking Filter Implementation Specification

## Overview
Add a toggle to the "Others" panel in Market Tracking that filters results to only show items matching those in "My Offers" by exact item name.

## Current Implementation Analysis

### Data Flow
1. `groupMarketData(vendingData)` processes vending machine data into two Maps:
   - `myOffers`: Items from owned vending machines
   - `others`: Items from other players' vending machines

2. `renderMarketTracking(vendingData)` renders both panels using the grouped data

3. Data structure for offers:
   ```javascript
   {
     itemId: number,
     itemName: string,
     currencyId: number,
     currencyName: string,
     costPerItem: number,
     totalStock: number,
     machineCount: number,
     machineIds: array
   }
   ```

### UI Structure
- Market tracking section with two panels: "My Offers" and "Others"
- Each panel has a header (title + summary) and body (content)
- Currently no filtering mechanism exists beyond currency type

## Implementation Plan

### 1. UI Changes
**Location**: Others panel header (line 665-667 in index.html)

**Add toggle element**:
```html
<div class="tracking-panel-header">
  <span>Others</span>
  <div style="display: flex; align-items: center; gap: 8px;">
    <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
      <input type="checkbox" id="othersFilterToggle" style="margin: 0;">
      <span>Match my offers</span>
    </label>
    <span class="muted" id="othersSummary">No offers yet</span>
  </div>
</div>
```

### 2. State Management
**Add global variable**:
```javascript
let showOnlyMatchingItems = false; // Filter state

// Load from localStorage on page load
function loadFilterState() {
  const stored = localStorage.getItem('marketTrackingFilter');
  if (stored !== null) {
    showOnlyMatchingItems = JSON.parse(stored);
    elOthersFilterToggle.checked = showOnlyMatchingItems;
  }
}

// Save to localStorage on change
function saveFilterState() {
  localStorage.setItem('marketTrackingFilter', JSON.stringify(showOnlyMatchingItems));
}
```

### 3. Filtering Logic
**Modify renderMarketTracking function**:

```javascript
function renderMarketTracking(vendingData) {
  const { myOffers, others } = groupMarketData(vendingData);
  const hasOwnedMachines = claimsMap.size > 0;

  // Create Set of item names from "My Offers" for efficient matching
  const myOfferItemNames = new Set(Array.from(myOffers.values()).map(offer => offer.itemName));

  // Filter "Others" if toggle is enabled
  let filteredOthers = others;
  if (showOnlyMatchingItems && myOfferItemNames.size > 0) {
    filteredOthers = new Map(Array.from(others.entries()).filter(([key, offer]) => 
      myOfferItemNames.has(offer.itemName)
    ));
  }

  // Render My Offers (unchanged)
  // ... existing code ...

  // Render Others with filtering
  if (filteredOthers.size === 0) {
    const message = showOnlyMatchingItems && others.size > 0 
      ? `No matching items found (${others.size} total offers)`
      : 'Other players\' sell orders appear here.';
    elOthersBody.innerHTML = `<div class="muted">${message}</div>`;
    elOthersSummary.textContent = showOnlyMatchingItems 
      ? `${filteredOthers.size}/${others.size} offers` 
      : `${others.size} offers`;
  } else {
    const rows = Array.from(filteredOthers.values())
      .sort((a, b) => a.itemName.localeCompare(b.itemName))
      .map(offer => `
        <div class="tracking-row">
          <div class="tracking-row-details">
            <div>${offer.itemName}</div>
            <small>${offer.costPerItem} × ${offer.currencyName} · Stock: ${offer.totalStock} · ${offer.machineCount} machine${offer.machineCount !== 1 ? 's' : ''}</small>
          </div>
        </div>
      `).join('');
    elOthersBody.innerHTML = rows;
    elOthersSummary.textContent = showOnlyMatchingItems 
      ? `${filteredOthers.size}/${others.size} offers` 
      : `${filteredOthers.size} offers`;
  }

  // Check for undercuts using filtered data if enabled
  if (myOffers.size > 0) {
    checkForUndercuts(myOffers, filteredOthers);
  }
}
```

### 4. Event Handling
**Add event listener**:
```javascript
// Event listener for toggle
elOthersFilterToggle.addEventListener('change', () => {
  showOnlyMatchingItems = elOthersFilterToggle.checked;
  saveFilterState();
  if (latestVending) {
    renderMarketTracking(latestVending);
  }
});
```

### 5. Integration Points
- **Element ID**: `elOthersFilterToggle`
- **State variable**: `showOnlyMatchingItems`
- **Storage key**: `marketTrackingFilter`
- **Filter logic**: Exact item name matching using Set for O(1) lookup

## Technical Considerations

### Performance
- Use Set for efficient item name lookup (O(1) complexity)
- Filter only when toggle is enabled
- Preserve original data structure for other functionality

### User Experience
- Clear visual feedback showing "filtered/total" counts when filter is active
- Informative message when no matches found
- Persistent state across page refreshes
 Smooth toggle interaction without page reload

### Edge Cases Handled
1. No "My Offers" available - show all "Others" regardless of toggle state
2. No "Others" available - appropriate messaging
3. Toggle enabled but no matches - show clear "no matching items" message
4. Manual offers included in "My Offers" when filtering

## Testing Scenarios
1. Toggle off - shows all "Others" (current behavior)
2. Toggle on with matching items - shows only matches
3. Toggle on with no matching items - shows appropriate message
4. Toggle state persistence across page refresh
5. Interaction with currency filtering
6. Manual offers filtering behavior

## Files to Modify
- `public/index.html` - Add UI element and JavaScript logic