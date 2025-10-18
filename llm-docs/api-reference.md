# API Reference

## CHCScheduler Class

The main class that handles all scheduling functionality.

### Constructor
```javascript
new CHCScheduler()
```
Creates a new scheduler instance and initializes event listeners.

### Methods

#### `parseProviderData(data)`
Parses Excel data into provider objects.

**Parameters:**
- `data` (Array): 2D array from Excel file (rows and columns)

**Returns:** `void`

**Throws:**
- `Error`: If required columns are missing
- `Error`: If no valid provider data found

**Example:**
```javascript
const scheduler = new CHCScheduler();
const excelData = [['Name', 'Days per Week', ...], ['John', 4, ...]];
scheduler.parseProviderData(excelData);
```

#### `parseDayOfWeek(dayStr)`
Converts day name strings to day numbers.

**Parameters:**
- `dayStr` (String): Comma-separated day names

**Returns:** `Array<Number>` - Array of day numbers (0=Sunday, 6=Saturday)

**Example:**
```javascript
parseDayOfWeek("Monday, Friday") // Returns [1, 5]
parseDayOfWeek("Mon, Wed, Fri") // Returns [1, 3, 5]
```

#### `parseShiftPreference(prefStr)`
Converts shift preference strings to shift types.

**Parameters:**
- `prefStr` (String): Comma-separated shift preferences

**Returns:** `Array<String>` - Array of shift types in preference order

**Example:**
```javascript
parseShiftPreference("open, mid, close") // Returns ["open", "mid", "close"]
parseShiftPreference("close, open") // Returns ["close", "open"]
```

#### `parsePTODates(ptoStr)`
Converts PTO date strings to Date objects.

**Parameters:**
- `ptoStr` (String): Comma-separated dates in MM/DD/YYYY format

**Returns:** `Array<Date>` - Array of valid Date objects

**Example:**
```javascript
parsePTODates("12/25/2024, 01/01/2025") // Returns [Date, Date]
parsePTODates("") // Returns []
```

#### `generateSchedule()`
Generates the monthly schedule based on provider data.

**Parameters:** None

**Returns:** `void`

**Side Effects:**
- Populates `this.schedule` with generated schedule
- Updates provider assignment tracking

**Example:**
```javascript
scheduler.generateSchedule();
console.log(scheduler.schedule); // Access generated schedule
```

#### `selectProviderForShift(providers, dayData, shiftType, isSaturday)`
Selects the best provider for a specific shift.

**Parameters:**
- `providers` (Array): Available provider objects
- `dayData` (Object): Day information including date and day of week
- `shiftType` (String): Type of shift ("open", "mid", "close")
- `isSaturday` (Boolean): Whether this is a Saturday shift

**Returns:** `Object|null` - Selected provider object or null if none available

**Algorithm:**
1. Filters providers based on availability constraints
2. Scores providers based on preferences and workload
3. Returns highest-scoring provider

#### `displaySchedule()`
Renders the generated schedule in the calendar view.

**Parameters:** None

**Returns:** `void`

**Side Effects:**
- Updates DOM with calendar HTML
- Shows schedule results section

#### `exportSchedule()`
Exports the current schedule to an Excel file.

**Parameters:** None

**Returns:** `void`

**Side Effects:**
- Triggers file download with generated Excel file

## Data Structures

### Provider Object
```javascript
{
    name: String,                    // Provider's full name
    daysPerWeek: Number,            // Days per week to work (1-7)
    saturdaysPerMonth: Number,      // Saturdays willing to work (0-4)
    preferredDaysOff: Array<Number>, // Preferred days off (0-6)
    shiftPreferences: Array<String>, // Preferred shift types
    ptoDates: Array<Date>,          // PTO dates
    assignedDays: Number,           // Days assigned so far (runtime)
    assignedSaturdays: Number,      // Saturdays assigned so far (runtime)
    currentShifts: Array<Object>    // Current shift assignments (runtime)
}
```

### Day Data Object
```javascript
{
    date: Date,                     // Date object
    dayOfWeek: Number,             // Day of week (0-6)
    shifts: {                      // Shift assignments
        open: Array<String>,       // Provider names for open shift
        mid: Array<String>,        // Provider names for mid shift
        close: Array<String>       // Provider names for close shift
    },
    isWeekend: Boolean             // Whether this is a weekend
}
```

### Schedule Object
```javascript
{
    [dayNumber]: DayData,          // Day number as key, day data as value
    // Example: { 1: { date: Date, dayOfWeek: 1, shifts: {...} }, ... }
}
```

## Event Handlers

### File Upload Handler
```javascript
document.getElementById('excel-file').addEventListener('change', (e) => {
    // Handles Excel file upload
    // Parses file and populates provider data
});
```

### Generate Schedule Handler
```javascript
document.getElementById('generate-schedule').addEventListener('click', () => {
    // Generates schedule when button clicked
    // Shows loading state and displays results
});
```

### Export Handler
```javascript
document.getElementById('export-schedule').addEventListener('click', () => {
    // Exports current schedule to Excel file
    // Triggers file download
});
```

## Utility Functions

### Date Utilities
```javascript
// Get number of weekdays in a month
getWeekdaysInMonth(year, month) // Returns Number

// Get number of Saturdays in a month  
getSaturdaysInMonth(year, month) // Returns Number
```

### UI Utilities
```javascript
// Show loading spinner
showLoading() // Returns void

// Hide loading spinner
hideLoading() // Returns void

// Display error message
showError(message) // Returns void
```

## Error Handling

### Error Types
1. **Validation Errors**: Invalid input data
2. **Parsing Errors**: Excel file format issues
3. **Scheduling Errors**: Insufficient coverage or conflicts
4. **Runtime Errors**: JavaScript execution errors

### Error Recovery
- **Input Validation**: Clear error messages for invalid data
- **Graceful Degradation**: Fallback to random assignment when preferences fail
- **User Feedback**: Loading states and progress indicators

## Browser Compatibility

### Supported Browsers
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### Required Features
- File API (for file uploads)
- ES6 Classes and Arrow Functions
- Array methods (map, filter, reduce)
- Date object methods

### Polyfills Required
- None (uses only standard JavaScript features)

## Performance Considerations

### Memory Usage
- **Provider Data**: ~1KB per provider
- **Schedule Data**: ~0.5KB per day
- **Total**: ~50KB for 20 providers, 31 days

### Processing Time
- **Small Dataset** (5-10 providers): <1 second
- **Medium Dataset** (10-20 providers): 1-3 seconds
- **Large Dataset** (20+ providers): 3-10 seconds

### Optimization Tips
1. **Limit Provider Count**: Keep under 30 providers for best performance
2. **Minimize PTO Dates**: Fewer dates = faster processing
3. **Simple Preferences**: Avoid overly complex preference lists

## Testing

### Unit Testing
```javascript
// Test data parsing
const testData = [['Name', 'Days per Week'], ['John', 4]];
scheduler.parseProviderData(testData);
assert(scheduler.providers.length === 1);

// Test preference parsing
const days = scheduler.parseDayOfWeek("Monday, Friday");
assert(days.length === 2);
assert(days[0] === 1);
```

### Integration Testing
```javascript
// Test full workflow
scheduler.parseProviderData(sampleData);
scheduler.generateSchedule();
assert(scheduler.schedule !== null);
assert(Object.keys(scheduler.schedule).length > 0);
```

### Manual Testing
1. Upload sample Excel file
2. Select a month
3. Generate schedule
4. Verify calendar display
5. Test export functionality
