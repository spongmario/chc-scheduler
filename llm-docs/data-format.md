# Data Format Specification

## Excel File Format

### Required Columns (In Order)
The Excel file must contain exactly 7 columns in the specified order:

| Column | Name | Type | Description | Example |
|--------|------|------|-------------|---------|
| 1 | Name | String | Provider's full name | "John Smith" |
| 2 | Days per Week | Integer | Number of days per week to work | 4 |
| 3 | Saturdays per Month | Integer | Number of Saturdays willing to work | 2 |
| 4 | Preferred Weekday Off | String | Comma-separated preferred days off | "Monday, Friday" |
| 5 | Shift Preference | String | Comma-separated shift preferences | "open, mid, close" |
| 6 | PTO Date | String | Comma-separated PTO dates | "12/25/2024, 01/01/2025" |
| 7 | Location | String | Urgent care location to schedule | "Central" or "Edmonds" |

### Column Details

#### Column 1: Name
- **Type**: String
- **Required**: Yes
- **Format**: Any text
- **Validation**: Must not be empty
- **Example**: "Dr. Sarah Johnson", "Nurse Mike Davis"

#### Column 2: Days per Week
- **Type**: Integer
- **Required**: Yes
- **Range**: 1-7
- **Validation**: Must be a positive integer
- **Example**: 4 (provider wants to work 4 days per week)

#### Column 3: Saturdays per Month
- **Type**: Integer
- **Required**: Yes
- **Range**: 0-4 (typically)
- **Validation**: Must be non-negative integer
- **Example**: 2 (provider willing to work 2 Saturdays per month)

#### Column 4: Preferred Weekday Off
- **Type**: String (comma-separated list)
- **Required**: No (can be empty)
- **Format**: Day names separated by commas
- **Valid Values**: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- **Abbreviations**: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- **Order**: List in order of preference (most preferred first)
- **Example**: "Monday, Friday" (prefers Monday off, then Friday)

#### Column 5: Shift Preference
- **Type**: String (comma-separated list)
- **Required**: No (defaults to "mid")
- **Format**: Shift types separated by commas
- **Valid Values**: open, mid, close
- **Order**: List in order of preference (most preferred first)
- **Example**: "open, mid, close" (prefers open shifts, then mid, then close)

#### Column 6: PTO Date
- **Type**: String (comma-separated list)
- **Required**: No (can be empty)
- **Format**: Dates separated by commas
- **Date Format**: MM/DD/YYYY
- **Validation**: Must be valid dates
- **Example**: "12/25/2024, 01/01/2025"

#### Column 7: Location
- **Type**: String
- **Required**: Yes
- **Format**: Location name
- **Valid Values**: "Central", "Edmonds"
- **Validation**: Must be one of the supported locations
- **Example**: "Central" (for Central urgent care location)

## Sample Data Format

### Complete Example
```csv
Name,Days per Week,Saturdays per Month,Preferred Weekday Off,Shift Preference,PTO Date,Location
Dr. Sarah Johnson,5,2,Monday,Friday,open,mid,12/24/2024,12/31/2024,Central
Nurse Mike Davis,4,1,Wednesday,Thursday,close,mid,open,,Central
Dr. Lisa Wilson,3,3,Tuesday,Wednesday,open,close,mid,01/15/2025,Edmonds
Nurse Tom Brown,4,2,Sunday,Monday,mid,open,close,,Edmonds
Dr. Maria Garcia,5,1,Thursday,Friday,close,open,mid,12/25/2024,Central
```

### Minimal Example
```csv
Name,Days per Week,Saturdays per Month,Preferred Weekday Off,Shift Preference,PTO Date,Location
John Smith,4,2,,open,,Central
Sarah Johnson,5,1,Monday,mid,12/24/2024,Edmonds
```

## Data Validation Rules

### Required Fields
- **Name**: Must not be empty or whitespace
- **Days per Week**: Must be a positive integer (1-7)
- **Saturdays per Month**: Must be a non-negative integer (0-4)
- **Location**: Must be "Central" or "Edmonds"

### Optional Fields
- **Preferred Weekday Off**: Can be empty or contain valid day names
- **Shift Preference**: Defaults to "mid" if empty
- **PTO Date**: Can be empty or contain valid dates

### Validation Logic
```javascript
// Name validation
if (!name || name.trim().length === 0) {
    throw new Error("Provider name is required");
}

// Days per week validation
const daysPerWeek = parseInt(value);
if (isNaN(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    throw new Error("Days per week must be between 1 and 7");
}

// Saturday validation
const saturdays = parseInt(value);
if (isNaN(saturdays) || saturdays < 0 || saturdays > 4) {
    throw new Error("Saturdays per month must be between 0 and 4");
}
```

## Parsing Logic

### Day Name Parsing
```javascript
const dayMap = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 0, 'sun': 0
};

function parseDayOfWeek(dayStr) {
    if (!dayStr) return [];
    const days = dayStr.split(',').map(d => d.trim().toLowerCase());
    return days.map(day => dayMap[day]).filter(d => d !== undefined);
}
```

### Shift Preference Parsing
```javascript
const shiftMap = {
    'open': 'open', 'opening': 'open',
    'mid': 'mid', 'middle': 'mid',
    'close': 'close', 'closing': 'close'
};

function parseShiftPreference(prefStr) {
    if (!prefStr) return ['mid'];
    const prefs = prefStr.split(',').map(p => p.trim().toLowerCase());
    return prefs.map(pref => shiftMap[pref]).filter(p => p !== undefined);
}
```

### Date Parsing
```javascript
function parsePTODates(ptoStr) {
    if (!ptoStr) return [];
    const dates = ptoStr.split(',').map(d => d.trim()).filter(d => d);
    return dates.map(dateStr => {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    }).filter(d => d);
}
```

## Error Handling

### Common Parsing Errors
1. **Invalid Day Names**: "Invalid day name: 'Tuesdays'"
2. **Invalid Shift Types**: "Invalid shift preference: 'evening'"
3. **Invalid Dates**: "Invalid PTO date: '25/12/2024'"
4. **Missing Required Fields**: "Provider name is required"

### Error Recovery
- **Invalid Preferences**: Uses default values (empty for days off, "mid" for shifts)
- **Invalid Dates**: Skips invalid dates, keeps valid ones
- **Missing Data**: Uses empty arrays for optional fields

## File Format Support

### Supported Formats
- **Excel 2007+**: .xlsx files
- **Excel 97-2003**: .xls files
- **CSV**: .csv files (for testing)

### Unsupported Formats
- **Google Sheets**: Must be downloaded as Excel first
- **Numbers**: Must be exported as Excel first
- **PDF**: Not supported

## Best Practices

### Data Preparation
1. **Use Consistent Naming**: Stick to full day names or abbreviations consistently
2. **Validate Dates**: Ensure PTO dates are in MM/DD/YYYY format
3. **Check Spelling**: Verify day names and shift types are spelled correctly
4. **Test with Sample Data**: Use the provided sample_data.csv as a template

### Common Mistakes to Avoid
1. **Wrong Column Order**: Ensure columns are in the exact specified order
2. **Invalid Date Formats**: Use MM/DD/YYYY, not DD/MM/YYYY
3. **Extra Spaces**: Trim whitespace from preference lists
4. **Missing Headers**: Always include the header row

### Troubleshooting Tips
1. **Check File Format**: Ensure it's a valid Excel file
2. **Verify Column Names**: Headers must match exactly (case-sensitive)
3. **Test with Sample**: Try the sample_data.csv first
4. **Check Browser Console**: Look for JavaScript errors during parsing
