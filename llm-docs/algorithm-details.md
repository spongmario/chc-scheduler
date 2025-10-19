# Scheduling Algorithm Details

## Overview
The CHC Scheduler uses a sophisticated multi-step algorithm that balances provider preferences, workload distribution, and operational constraints to generate optimal monthly schedules.

## Algorithm Phases

### Phase 1: Data Validation and Preparation
```javascript
// Parse Excel data and validate structure
parseProviderData(data) {
    // Extract headers and map columns
    // Validate required fields exist
    // Parse preferences into arrays
    // Convert PTO dates to Date objects
}
```

**Key Steps:**
1. **Header Mapping**: Identifies required columns by name matching
2. **Data Validation**: Ensures all providers have valid names and days per week
3. **Preference Parsing**: Converts comma-separated preferences to ordered arrays
4. **Date Processing**: Converts PTO dates from strings to Date objects

### Phase 2: Schedule Initialization
```javascript
// Create empty schedule structure for the month
generateSchedule() {
    // Calculate days in month
    // Initialize day objects with shift slots
    // Identify weekends vs weekdays
    // Handle float providers distribution
}
```

**Key Steps:**
1. **Month Analysis**: Determines number of days and day-of-week patterns
2. **Shift Structure**: Creates slots for open, mid, close shifts
3. **Weekend Identification**: Marks Saturday/Sunday for special handling
4. **Float Provider Distribution**: Distributes float providers between Central and Edmonds locations

### Phase 3: Workload Distribution Planning
```javascript
// Calculate total shifts needed and per-provider targets
distributeShifts(schedule, totalShifts) {
    // Calculate total weekdays and Saturdays
    // Determine shifts per day (3 for weekdays, 2 for weekends)
    // Set up working provider tracking
}
```

**Key Calculations:**
- **Weekday Shifts**: `weekdays × 3 shifts per day`
- **Weekend Shifts**: `Saturdays × 2 shifts per day`
- **Total Coverage**: Sum of all required shifts

### Phase 4: Day-by-Day Assignment
```javascript
// For each day, assign providers to shifts
for (let day = 1; day <= daysInMonth; day++) {
    const shiftsNeeded = isSaturday ? ['open', 'close'] : ['open', 'mid', 'close'];
    
    for (const shiftType of shiftsNeeded) {
        const provider = selectProviderForShift(providers, dayData, shiftType, isSaturday);
        assignProviderToShift(provider, day, shiftType);
    }
}
```

**Assignment Logic:**
1. **Skip Sundays**: No shifts scheduled on Sundays
2. **Saturday Handling**: Only open and close shifts (no mid shift)
3. **Sequential Assignment**: Assigns one shift at a time to avoid conflicts

### Phase 5: Provider Selection Algorithm
```javascript
selectProviderForShift(providers, dayData, shiftType, isSaturday) {
    // Filter available providers
    const available = providers.filter(p => {
        return !assignedToday(p) && 
               !onPTO(p, dayData.date) && 
               !preferredDayOff(p, dayData.dayOfWeek) &&
               !saturdayLimitExceeded(p, isSaturday);
    });
    
    // Score and rank providers
    return rankProviders(available, shiftType, isSaturday);
}
```

## Scoring System

### Provider Scoring Formula
```javascript
score = baseScore + preferenceScore + workloadScore + randomFactor
```

### Score Components

#### 1. Base Workload Score
```javascript
baseScore = (10 - assignedDays) * 10
```
- **Purpose**: Ensures fair distribution of shifts
- **Range**: 0-100 points
- **Higher score**: Fewer assigned days

#### 2. Shift Preference Score
```javascript
if (shiftPreferenceIndex !== -1) {
    // 1st preference gets highest score, 2nd gets medium, 3rd gets very low (last resort)
    if (shiftPreferenceIndex === 0) {
        score += 100; // Highest priority for 1st preference
    } else if (shiftPreferenceIndex === 1) {
        score += 50; // Medium priority for 2nd preference
    } else if (shiftPreferenceIndex === 2) {
        score += 5; // Very low priority for 3rd preference (absolute last resort)
    } else {
        score += 1; // Minimal score for any other preferences
    }
} else if (shiftPreferences.length === 0) {
    // Person has no preferences (empty shift preferences column) - they don't care
    // Give them a moderate score, but lower than people with explicit preferences
    score += 25;
} else {
    // Person has preferences but this shift type isn't in them
    // This is worse than having no preferences at all
    score += Math.random() * 5;
}
```
- **Purpose**: Honors provider shift preferences with strong prioritization
- **Range**: 1-100 points (1st preference gets 100, 2nd gets 50, 3rd gets 5)
- **Higher score**: Earlier preference match
- **Key Features**:
  - **1st Preference**: Gets highest priority (100 points)
  - **2nd Preference**: Gets medium priority (50 points)  
  - **3rd Preference**: Gets very low priority (5 points) - absolute last resort
  - **No Preferences**: Gets moderate score (25 points) - lower than explicit preferences
  - **Mismatched Preferences**: Gets lowest score (random 0-5 points)

#### 3. Saturday Coverage Score
```javascript
if (isSaturday && assignedSaturdays < saturdaysPerMonth) {
    saturdayScore = 30
}
```
- **Purpose**: Ensures adequate weekend coverage
- **Range**: 0-30 points
- **Higher score**: Provider needs more Saturday shifts

#### 4. Random Factor
```javascript
randomFactor = Math.random() * 10
```
- **Purpose**: Breaks ties and adds variability
- **Range**: 0-10 points
- **Effect**: Prevents identical schedules on regeneration

## Float Provider Handling

### Float Provider Assignment Strategy
Float providers are handled dynamically during the scheduling process, allowing them to work at either Central or Edmonds locations as needed:

```javascript
// Float providers are considered for any location when regular providers are unavailable
if (!provider) {
    const floatProviders = allProviders.filter(p => p.isFloat && !p.currentShifts.some(s => s.day === day));
    provider = this.selectProviderForShiftWithFloats(floatProviders, dayData, shiftType, isSaturday, location);
}
```

### Float Provider Logic
1. **Dynamic Assignment**: Float providers are considered for any location when regular providers are unavailable
2. **Balanced Distribution**: The system tracks float assignments to ensure balanced coverage between locations
3. **Priority System**: Regular location providers are prioritized, with float providers used as backup
4. **Same Scoring**: Float providers use the same scoring system as regular providers for fair assignment
5. **No Double-Booking**: Float providers can only work one shift per day, regardless of location

## Constraint Handling

### Hard Constraints (Must Be Respected)
1. **PTO Dates**: Never schedule on provider PTO
2. **Double Booking**: Never schedule same provider twice in one day
3. **Saturday Limits**: Respect maximum Saturday assignments per month
4. **Days Per Week**: Respect maximum days per week for each provider
5. **Float Provider Single Assignment**: Float providers can only work one shift per day

### Soft Constraints (Preferably Respected)
1. **Preferred Days Off**: Try to avoid scheduling on preferred days
2. **Shift Preferences**: Try to match preferred shift types
3. **Workload Balance**: Distribute shifts fairly among providers
4. **Float Provider Balance**: Use float providers to balance workload between locations
5. **Location Priority**: Regular location providers are prioritized over float providers

### Constraint Resolution Strategy
```javascript
// Priority order for constraint resolution
1. Hard constraints (filter out invalid options)
2. Preference matching (score based on preference order)
3. Workload balancing (ensure fair distribution)
4. Random selection (break ties and add variety)
```

## Algorithm Complexity

### Time Complexity
- **Data Parsing**: O(n) where n = number of providers
- **Schedule Generation**: O(d × s) where d = days in month, s = shifts per day
- **Provider Selection**: O(p × log p) where p = available providers per shift
- **Overall**: O(d × s × p × log p)

### Space Complexity
- **Provider Data**: O(n) for n providers
- **Schedule Storage**: O(d × s) for d days and s shifts
- **Working State**: O(n) for provider tracking
- **Overall**: O(n + d × s)

## Performance Characteristics

### Typical Performance
- **Small Facility** (5-10 providers): <1 second
- **Medium Facility** (10-20 providers): 1-3 seconds
- **Large Facility** (20+ providers): 3-10 seconds

### Bottlenecks
1. **Provider Selection**: Most computationally expensive step
2. **Preference Scoring**: Complex calculations for each provider
3. **Constraint Checking**: Multiple validation steps per assignment

## Optimization Strategies

### Current Optimizations
1. **Early Filtering**: Remove invalid providers before scoring
2. **Cached Calculations**: Store frequently used values
3. **Efficient Sorting**: Use native JavaScript sort with custom comparator

### Potential Future Optimizations
1. **Parallel Processing**: Use Web Workers for large datasets
2. **Caching**: Store intermediate results for similar schedules
3. **Heuristic Improvements**: Better initial provider ordering
4. **Constraint Propagation**: More sophisticated constraint handling

## Error Handling

### Input Validation
- **File Format**: Ensures Excel file is readable
- **Column Structure**: Validates required columns exist
- **Data Types**: Checks numeric fields are valid numbers
- **Date Formats**: Validates PTO date parsing

### Runtime Errors
- **No Available Providers**: Handles cases where no providers can work a shift
- **Insufficient Coverage**: Warns when not enough providers for all shifts
- **Invalid Preferences**: Gracefully handles malformed preference data

### Recovery Strategies
- **Fallback Assignment**: Uses random selection when preferences fail
- **Constraint Relaxation**: Gradually relaxes soft constraints if needed
- **Error Reporting**: Provides clear messages about scheduling issues
