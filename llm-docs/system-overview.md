# CHC Scheduler System Overview

## Purpose
The CHC Scheduler is a web-based application designed to generate optimal shift schedules for urgent care facilities. It processes provider preferences and constraints to create monthly schedules that balance workload, respect preferences, and ensure adequate coverage.

## Core Components

### 1. Frontend Interface (`index.html`)
- **File Upload**: Handles Excel file input with provider data
- **Month Selection**: Allows users to choose which month to schedule
- **Visual Calendar**: Displays generated schedules in an easy-to-read format
- **Export Functionality**: Downloads schedules as Excel files

### 2. Styling (`styles.css`)
- **Responsive Design**: Works on desktop and mobile devices
- **Medical Theme**: Professional appearance suitable for healthcare facilities
- **Color-coded Shifts**: Different colors for open, mid, close, and off shifts
- **Accessibility**: High contrast and readable fonts

### 3. Scheduling Engine (`script.js`)
- **Data Parsing**: Processes Excel files using SheetJS library
- **Algorithm Logic**: Implements preference-based scheduling
- **Conflict Resolution**: Handles PTO, double-booking, and preference conflicts
- **Export Generation**: Creates downloadable Excel schedules

## Data Flow

```
Excel File → Parse Data → Validate Input → Generate Schedule → Display Calendar → Export Results
```

## Key Features

### Input Processing
- Accepts Excel files with standardized column format
- Validates data integrity and completeness
- Handles multiple preferences in priority order
- Parses PTO dates and availability constraints

### Scheduling Algorithm
- **Preference-based**: Honors provider preferences when possible
- **Constraint-aware**: Respects PTO, preferred days off, and availability limits
- **Fair distribution**: Balances workload across all providers
- **Flexible fallbacks**: Adapts when ideal preferences can't be met

### Output Generation
- **Visual calendar**: Month view with color-coded shifts
- **Excel export**: Downloadable schedule for further editing
- **Error handling**: Clear messages for invalid inputs or conflicts

## Technical Architecture

### Dependencies
- **SheetJS**: Client-side Excel file processing
- **Pure JavaScript**: No external frameworks required
- **HTML5/CSS3**: Modern web standards

### Browser Compatibility
- Works in all modern browsers
- No server-side requirements
- Runs entirely in the browser

### File Structure
```
chc-scheduler/
├── index.html          # Main application
├── styles.css          # Styling and layout
├── script.js           # Core scheduling logic
├── sample_data.csv     # Example input data
├── README.md           # User documentation
└── llm-docs/           # Technical documentation
    ├── system-overview.md
    ├── algorithm-details.md
    ├── data-format.md
    └── api-reference.md
```

## Use Cases

### Primary Use Case
Monthly shift scheduling for urgent care facilities with 5-20 providers

### Secondary Use Cases
- Backup scheduling when regular systems fail
- Scenario planning for different staffing levels
- Preference analysis and optimization
- Schedule template generation

## Limitations

### Current Limitations
- Single month scheduling only
- No recurring schedule patterns
- No integration with existing HR systems
- Manual Excel file preparation required

### Scalability Considerations
- Performance may degrade with >50 providers
- Large Excel files may cause browser memory issues
- No concurrent user support (single-user application)

## Future Enhancements

### Potential Improvements
- Multi-month scheduling
- Recurring pattern support
- Database integration
- Real-time collaboration
- Mobile app version
- Advanced analytics and reporting
