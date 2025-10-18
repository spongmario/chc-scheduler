# CHC Scheduler - Urgent Care Shift Planning Tool

A web-based tool for generating optimal shift schedules for urgent care facilities based on provider preferences and availability.

## Features

- **Excel File Upload**: Upload provider preferences in a standardized Excel format
- **Month Selection**: Choose which month to generate a schedule for
- **Smart Scheduling Algorithm**: Considers multiple factors to create optimal schedules:
  - Days per week each provider wants to work
  - Saturday availability preferences
  - Preferred weekday off
  - Shift type preferences (open, mid, close)
  - PTO dates
- **Visual Calendar Display**: Easy-to-read monthly calendar view
- **Export Functionality**: Download generated schedules as Excel files

## How to Use

### 1. Prepare Your Excel File

Create an Excel file with the following columns in row 1 (in this exact order):

| Column | Description | Example |
|--------|-------------|---------|
| Name | Provider's full name | John Smith |
| Days per Week | Number of days per week they want to work | 4 |
| Saturdays per Month | Number of Saturdays they're willing to work | 2 |
| Preferred Weekday Off | Preferred days off in order (comma-separated) | Monday, Friday |
| Shift Preference | Preferred shift types in order (comma-separated) | open, mid, close |
| PTO Date | Comma-separated PTO dates (MM/DD/YYYY format) | 12/25/2024, 01/01/2025 |

### 2. Generate Schedule

1. Open `index.html` in your web browser
2. Select the month you want to schedule
3. Upload your Excel file
4. Click "Generate Schedule"
5. Review the generated schedule
6. Export to Excel if needed

## Sample Data

Here's an example of what your Excel file should look like:

```
Name,Days per Week,Saturdays per Month,Preferred Weekday Off,Shift Preference,PTO Date
John Smith,4,2,Monday,Friday,open,mid,12/25/2024,01/01/2025
Sarah Johnson,5,1,Monday,Tuesday,mid,open,12/24/2024
Mike Davis,3,3,Wednesday,Thursday,close,mid,open,
Lisa Wilson,4,2,Tuesday,Wednesday,open,close,12/31/2024
```

## Scheduling Algorithm

The tool uses a sophisticated algorithm that:

1. **Respects PTO**: Never schedules providers on their PTO dates
2. **Honors Preferred Days Off**: Tries to avoid scheduling on preferred days off (in order of preference)
3. **Balances Workload**: Distributes shifts fairly among providers
4. **Considers Shift Preferences**: Tries to match providers with their preferred shift types (in order of preference)
5. **Flexible Fallbacks**: If top preferences can't be accommodated, randomly selects from available options
6. **Manages Saturday Coverage**: Ensures adequate Saturday coverage based on preferences
7. **Prevents Double Booking**: Never schedules the same provider twice in one day

## Technical Details

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks required)
- **Excel Processing**: Uses SheetJS library for file parsing
- **Browser Compatibility**: Works in all modern browsers
- **No Server Required**: Runs entirely in the browser

## File Structure

```
chc-scheduler/
├── index.html          # Main application file
├── styles.css          # Styling and layout
├── script.js           # Scheduling algorithm and logic
└── README.md           # This documentation
```

## Troubleshooting

### Common Issues

1. **"Missing required column" error**: Ensure your Excel file has all 6 required columns in the correct order
2. **"No valid provider data found"**: Check that your data rows have names and days per week values
3. **Schedule gaps**: This may happen if there aren't enough providers to cover all shifts. Consider adjusting provider availability or adding more staff

### Excel Format Tips

- Use MM/DD/YYYY format for PTO dates
- Separate multiple PTO dates with commas
- Use full day names (Monday, Tuesday, etc.) or abbreviations (Mon, Tue, etc.)
- For preferences, list them in order of priority, separated by commas
- Shift preferences should be: "open", "mid", or "close" (in order of preference)
- Days off should be listed in order of preference (most preferred first)

## Support

For questions or issues, please check that your Excel file follows the required format and that all providers have valid data entries.
