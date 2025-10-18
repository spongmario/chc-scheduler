# Development Guide

## Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Text editor or IDE
- Basic knowledge of HTML, CSS, and JavaScript

### Setup
1. Clone or download the project
2. Open `index.html` in a web browser
3. For development, use a local server:
   ```bash
   python3 -m http.server 8000
   # or
   npx serve .
   ```

## Project Structure

```
chc-scheduler/
├── index.html              # Main HTML file
├── styles.css              # CSS styles
├── script.js               # JavaScript logic
├── sample_data.csv         # Example data
├── README.md               # User documentation
└── llm-docs/               # Technical documentation
    ├── system-overview.md
    ├── algorithm-details.md
    ├── data-format.md
    ├── api-reference.md
    └── development-guide.md
```

## Code Organization

### HTML Structure (`index.html`)
```html
<!DOCTYPE html>
<html>
<head>
    <!-- Meta tags and external dependencies -->
</head>
<body>
    <div class="container">
        <header><!-- Title and description --></header>
        <main>
            <div class="upload-section"><!-- File upload form --></div>
            <div id="loading"><!-- Loading spinner --></div>
            <div id="schedule-results"><!-- Generated schedule --></div>
            <div id="error-message"><!-- Error display --></div>
        </main>
    </div>
</body>
</html>
```

### CSS Architecture (`styles.css`)
```css
/* Reset and base styles */
* { /* Global reset */ }

/* Layout components */
.container { /* Main container */ }
.upload-section { /* Upload form styling */ }
.calendar { /* Schedule table styling */ }

/* Component styles */
.btn-primary { /* Primary button */ }
.shift { /* Shift display styling */ }

/* Utility classes */
.hidden { /* Hide/show elements */ }
```

### JavaScript Classes (`script.js`)
```javascript
class CHCScheduler {
    constructor() { /* Initialize */ }
    
    // Data parsing methods
    parseProviderData() { /* Parse Excel data */ }
    parseDayOfWeek() { /* Parse day preferences */ }
    parseShiftPreference() { /* Parse shift preferences */ }
    
    // Scheduling methods
    generateSchedule() { /* Main scheduling logic */ }
    selectProviderForShift() { /* Provider selection */ }
    
    // UI methods
    displaySchedule() { /* Render calendar */ }
    exportSchedule() { /* Export to Excel */ }
}
```

## Development Workflow

### 1. Making Changes
1. Edit the relevant file (HTML, CSS, or JS)
2. Save the file
3. Refresh the browser to see changes
4. Test functionality with sample data

### 2. Testing Changes
1. Use the provided `sample_data.csv` for testing
2. Try different month selections
3. Test error conditions (invalid files, missing data)
4. Verify export functionality

### 3. Debugging
1. Open browser developer tools (F12)
2. Check console for JavaScript errors
3. Use `console.log()` for debugging
4. Inspect DOM elements for styling issues

## Key Development Concepts

### Data Flow
```
Excel File → FileReader → SheetJS → Parse Data → Generate Schedule → Display UI
```

### State Management
The application uses a simple state management approach:
- `this.providers`: Array of provider objects
- `this.schedule`: Generated schedule object
- `this.selectedMonth`: Currently selected month

### Event Handling
```javascript
// File upload
document.getElementById('excel-file').addEventListener('change', (e) => {
    this.handleFileUpload(e);
});

// Generate schedule
document.getElementById('generate-schedule').addEventListener('click', () => {
    this.handleGenerateSchedule();
});
```

## Common Development Tasks

### Adding New Features

#### 1. New Provider Field
```javascript
// In parseProviderData()
const provider = {
    // ... existing fields
    newField: this.parseNewField(row[columnMap['new field']])
};

// Add parsing method
parseNewField(fieldStr) {
    // Parse the new field
    return parsedValue;
}
```

#### 2. New Shift Type
```javascript
// In generateSchedule()
const shiftsNeeded = isSaturday ? 
    ['open', 'close'] : 
    ['open', 'mid', 'close', 'newShift'];

// Update CSS for new shift type
.shift.newShift {
    background-color: #color;
    color: #textColor;
}
```

#### 3. New Constraint
```javascript
// In selectProviderForShift()
const availableProviders = providers.filter(p => {
    // ... existing constraints
    if (newConstraint(p)) return false;
    return true;
});
```

### Modifying the Algorithm

#### 1. Changing Scoring
```javascript
// In selectProviderForShift()
let score = 0;
score += (10 - p.assignedDays) * 10;  // Workload balance
score += preferenceScore;              // Preference matching
score += newScoreComponent;            // New scoring factor
```

#### 2. Adding Constraints
```javascript
// In selectProviderForShift()
const availableProviders = providers.filter(p => {
    // ... existing filters
    if (newConstraint(p, dayData)) return false;
    return true;
});
```

#### 3. Modifying Schedule Structure
```javascript
// In generateSchedule()
const schedule = {};
for (let day = 1; day <= daysInMonth; day++) {
    schedule[day] = {
        // ... existing structure
        newField: newValue
    };
}
```

## Performance Optimization

### 1. Algorithm Optimization
```javascript
// Cache frequently used values
const totalWeekdays = this.getWeekdaysInMonth(year, month);
const totalSaturdays = this.getSaturdaysInMonth(year, month);

// Use efficient data structures
const providerMap = new Map(providers.map(p => [p.name, p]));
```

### 2. DOM Optimization
```javascript
// Batch DOM updates
const fragment = document.createDocumentFragment();
// ... build elements
container.appendChild(fragment);

// Use efficient selectors
const elements = document.querySelectorAll('.shift');
```

### 3. Memory Management
```javascript
// Clear large objects when done
this.schedule = null;
this.providers = [];

// Use weak references where appropriate
const weakMap = new WeakMap();
```

## Error Handling Best Practices

### 1. Input Validation
```javascript
parseProviderData(data) {
    if (!data || data.length < 2) {
        throw new Error('Invalid data format');
    }
    
    // Validate each row
    for (let i = 1; i < data.length; i++) {
        this.validateProviderRow(data[i], i);
    }
}
```

### 2. Graceful Degradation
```javascript
selectProviderForShift(providers, dayData, shiftType, isSaturday) {
    const availableProviders = this.filterAvailableProviders(providers, dayData);
    
    if (availableProviders.length === 0) {
        console.warn(`No providers available for ${shiftType} shift on ${dayData.date}`);
        return null;
    }
    
    return this.selectBestProvider(availableProviders, shiftType);
}
```

### 3. User Feedback
```javascript
handleGenerateSchedule() {
    try {
        this.showLoading();
        this.generateSchedule();
        this.displaySchedule();
    } catch (error) {
        this.hideLoading();
        this.showError(`Schedule generation failed: ${error.message}`);
    }
}
```

## Testing Strategies

### 1. Unit Testing
```javascript
// Test individual methods
function testParseDayOfWeek() {
    const scheduler = new CHCScheduler();
    const result = scheduler.parseDayOfWeek("Monday, Friday");
    assert(result.length === 2);
    assert(result[0] === 1);
    assert(result[1] === 5);
}
```

### 2. Integration Testing
```javascript
// Test complete workflows
function testFullWorkflow() {
    const scheduler = new CHCScheduler();
    const sampleData = loadSampleData();
    
    scheduler.parseProviderData(sampleData);
    scheduler.generateSchedule();
    
    assert(scheduler.schedule !== null);
    assert(Object.keys(scheduler.schedule).length > 0);
}
```

### 3. Manual Testing
1. **Happy Path**: Upload valid file, generate schedule
2. **Error Cases**: Upload invalid file, missing data
3. **Edge Cases**: Empty file, single provider, all PTO
4. **UI Testing**: Different screen sizes, browser compatibility

## Deployment

### 1. Static Hosting
The application can be deployed to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront

### 2. Local Deployment
```bash
# Simple HTTP server
python3 -m http.server 8000

# Node.js server
npx serve .

# PHP server
php -S localhost:8000
```

### 3. Production Considerations
- **File Size**: Keep under 1MB for fast loading
- **Browser Support**: Test on target browsers
- **Error Handling**: Implement proper error reporting
- **Performance**: Monitor loading times and memory usage

## Troubleshooting

### Common Issues

#### 1. Excel File Not Loading
- Check file format (.xlsx or .xls)
- Verify column headers match exactly
- Check browser console for errors

#### 2. Schedule Generation Fails
- Ensure provider data is valid
- Check for sufficient provider coverage
- Verify date formats are correct

#### 3. UI Display Issues
- Check CSS file is loading
- Verify HTML structure is correct
- Test on different screen sizes

#### 4. Performance Problems
- Reduce number of providers
- Simplify preference lists
- Check for memory leaks in browser

### Debug Tools
- **Browser DevTools**: Console, Network, Elements tabs
- **Console Logging**: Add `console.log()` statements
- **Breakpoints**: Use debugger statement
- **Performance Profiler**: Browser performance tools
