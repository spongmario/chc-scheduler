class CHCScheduler {
    constructor() {
        this.providers = [];
        this.schedule = {};
        this.selectedMonth = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('generate-schedule').addEventListener('click', () => this.handleGenerateSchedule());
        document.getElementById('regenerate-schedule').addEventListener('click', () => this.handleGenerateSchedule());
        document.getElementById('export-schedule').addEventListener('click', () => this.exportSchedule());
        document.getElementById('excel-file').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('month-select').addEventListener('change', (e) => {
            this.selectedMonth = e.target.value;
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                this.parseProviderData(jsonData);
            } catch (error) {
                this.showError('Error reading Excel file: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    parseProviderData(data) {
        if (data.length < 2) {
            this.showError('Excel file must have at least a header row and one data row');
            return;
        }

        const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : '');
        const expectedHeaders = ['name', 'days per week', 'saturdays per month', 'preferred weekday off', 'shift preference', 'pto date'];
        
        // Find column indices
        const columnMap = {};
        expectedHeaders.forEach(expected => {
            const index = headers.findIndex(h => h.includes(expected) || expected.includes(h));
            if (index === -1) {
                this.showError(`Missing required column: ${expected}`);
                return;
            }
            columnMap[expected] = index;
        });

        this.providers = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row.length === 0 || !row[columnMap['name']]) continue;

            const provider = {
                name: row[columnMap['name']].toString().trim(),
                daysPerWeek: parseInt(row[columnMap['days per week']]) || 0,
                saturdaysPerMonth: parseInt(row[columnMap['saturdays per month']]) || 0,
                preferredDaysOff: this.parseDayOfWeek(row[columnMap['preferred weekday off']]),
                shiftPreferences: this.parseShiftPreference(row[columnMap['shift preference']]),
                ptoDates: this.parsePTODates(row[columnMap['pto date']])
            };

            if (provider.name && provider.daysPerWeek > 0) {
                this.providers.push(provider);
            }
        }

        if (this.providers.length === 0) {
            this.showError('No valid provider data found in Excel file');
        }
    }

    parseDayOfWeek(dayStr) {
        if (!dayStr) return [];
        const days = dayStr.toString().split(',').map(d => d.trim().toLowerCase());
        const dayMap = {
            'monday': 1, 'mon': 1,
            'tuesday': 2, 'tue': 2, 'tues': 2,
            'wednesday': 3, 'wed': 3,
            'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
            'friday': 5, 'fri': 5,
            'saturday': 6, 'sat': 6,
            'sunday': 0, 'sun': 0
        };
        
        const parsedDays = days.map(day => dayMap[day]).filter(d => d !== undefined);
        return parsedDays.length > 0 ? parsedDays : [];
    }

    parseShiftPreference(prefStr) {
        if (!prefStr) return ['mid'];
        const prefs = prefStr.toString().split(',').map(p => p.trim().toLowerCase());
        const shiftMap = {
            'open': 'open', 'opening': 'open',
            'mid': 'mid', 'middle': 'mid',
            'close': 'close', 'closing': 'close'
        };
        
        const parsedPrefs = prefs.map(pref => shiftMap[pref]).filter(p => p !== undefined);
        return parsedPrefs.length > 0 ? parsedPrefs : ['mid'];
    }

    parsePTODates(ptoStr) {
        if (!ptoStr) return [];
        const dates = ptoStr.toString().split(',').map(d => d.trim()).filter(d => d);
        return dates.map(dateStr => {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        }).filter(d => d);
    }

    handleGenerateSchedule() {
        if (!this.selectedMonth) {
            this.showError('Please select a month to schedule');
            return;
        }

        if (this.providers.length === 0) {
            this.showError('Please upload an Excel file with provider data first');
            return;
        }

        this.showLoading();
        setTimeout(() => {
            try {
                this.generateSchedule();
                this.displaySchedule();
                this.hideLoading();
            } catch (error) {
                this.hideLoading();
                this.showError('Error generating schedule: ' + error.message);
            }
        }, 1000);
    }

    generateSchedule() {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1; // JavaScript months are 0-indexed
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const schedule = {};

        // Initialize schedule structure
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            schedule[day] = {
                date: date,
                dayOfWeek: dayOfWeek,
                shifts: { open: [], mid: [], close: [] },
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6
            };
        }

        // Calculate total shifts needed
        const totalWeekdays = this.getWeekdaysInMonth(year, month);
        const totalSaturdays = this.getSaturdaysInMonth(year, month);
        const totalShifts = totalWeekdays * 3 + totalSaturdays * 2; // 3 shifts weekdays, 2 on weekends

        // Distribute shifts among providers
        this.distributeShifts(schedule, totalShifts);

        this.schedule = schedule;
    }

    getWeekdaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let weekdays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayOfWeek = new Date(year, month, day).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) weekdays++;
        }
        return weekdays;
    }

    getSaturdaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let saturdays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayOfWeek = new Date(year, month, day).getDay();
            if (dayOfWeek === 6) saturdays++;
        }
        return saturdays;
    }

    distributeShifts(schedule, totalShifts) {
        // Create a working copy of providers with current assignments
        const workingProviders = this.providers.map(p => ({
            ...p,
            assignedDays: 0,
            assignedSaturdays: 0,
            currentShifts: []
        }));

        // Calculate target assignments per provider
        const totalDaysPerWeek = workingProviders.reduce((sum, p) => sum + p.daysPerWeek, 0);
        const totalSaturdaysPerMonth = workingProviders.reduce((sum, p) => sum + p.saturdaysPerMonth, 0);

        // Distribute shifts day by day
        for (let day = 1; day <= Object.keys(schedule).length; day++) {
            const dayData = schedule[day];
            const isSaturday = dayData.dayOfWeek === 6;
            const isSunday = dayData.dayOfWeek === 0;

            if (isSunday) continue; // Skip Sundays

            const shiftsNeeded = isSaturday ? ['open', 'close'] : ['open', 'mid', 'close'];

            for (const shiftType of shiftsNeeded) {
                const provider = this.selectProviderForShift(workingProviders, dayData, shiftType, isSaturday);
                if (provider) {
                    dayData.shifts[shiftType].push(provider.name);
                    provider.assignedDays++;
                    if (isSaturday) provider.assignedSaturdays++;
                    provider.currentShifts.push({ day, shiftType });
                }
            }
        }
    }

    selectProviderForShift(providers, dayData, shiftType, isSaturday) {
        // Filter available providers
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO
            const isOnPTO = p.ptoDates.some(ptoDate => 
                ptoDate.getDate() === dayData.date.getDate() && 
                ptoDate.getMonth() === dayData.date.getMonth() &&
                ptoDate.getFullYear() === dayData.date.getFullYear()
            );
            if (isOnPTO) return false;

            // Check if it's a preferred day off (any of their preferences)
            if (p.preferredDaysOff.includes(dayData.dayOfWeek)) return false;

            // Check Saturday limits
            if (isSaturday && p.assignedSaturdays >= p.saturdaysPerMonth) return false;

            return true;
        });

        if (availableProviders.length === 0) return null;

        // Score providers based on preferences and fairness
        const scoredProviders = availableProviders.map(p => {
            let score = 0;

            // Prefer providers who haven't worked as much
            score += (10 - p.assignedDays) * 10;

            // Prefer shift preference match (check in order of preference)
            const shiftPreferenceIndex = p.shiftPreferences.indexOf(shiftType);
            if (shiftPreferenceIndex !== -1) {
                // Higher score for earlier preferences (lower index)
                score += (p.shiftPreferences.length - shiftPreferenceIndex) * 20;
            } else {
                // If shift type not in preferences, add small random factor
                score += Math.random() * 5;
            }

            // Prefer providers who need more Saturday shifts
            if (isSaturday && p.assignedSaturdays < p.saturdaysPerMonth) score += 30;

            // Random factor to break ties
            score += Math.random() * 10;

            return { provider: p, score };
        });

        // Sort by score and return the best provider
        scoredProviders.sort((a, b) => b.score - a.score);
        return scoredProviders[0].provider;
    }

    displaySchedule() {
        const container = document.getElementById('calendar-container');
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;

        let html = '<table class="calendar"><thead><tr>';
        html += '<th>Date</th><th>Day</th><th>Open</th><th>Mid</th><th>Close</th></tr></thead><tbody>';

        for (let day = 1; day <= Object.keys(this.schedule).length; day++) {
            const dayData = this.schedule[day];
            const date = new Date(year, month, day);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            html += '<tr>';
            html += `<td>${day}</td>`;
            html += `<td class="${dayData.isWeekend ? 'weekend' : ''}">${dayNames[dayData.dayOfWeek]}</td>`;
            
            // Display shifts
            ['open', 'mid', 'close'].forEach(shiftType => {
                const providers = dayData.shifts[shiftType] || [];
                html += `<td>`;
                if (providers.length > 0) {
                    providers.forEach(provider => {
                        const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                            ptoDate.getDate() === day && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                        );
                        html += `<span class="shift ${shiftType} ${isPTO ? 'pto' : ''}">${provider}</span>`;
                    });
                } else {
                    html += '<span class="shift off">OFF</span>';
                }
                html += '</td>';
            });
            
            html += '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;

        document.getElementById('schedule-results').classList.remove('hidden');
    }

    exportSchedule() {
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;
        const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

        // Create export data
        const exportData = [];
        exportData.push(['Date', 'Day', 'Open', 'Mid', 'Close']);

        for (let day = 1; day <= Object.keys(this.schedule).length; day++) {
            const dayData = this.schedule[day];
            const date = new Date(year, month, day);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            const row = [
                `${monthName} ${day}`,
                dayNames[dayData.dayOfWeek],
                (dayData.shifts.open || []).join(', '),
                (dayData.shifts.mid || []).join(', '),
                (dayData.shifts.close || []).join(', ')
            ];
            exportData.push(row);
        }

        // Create workbook and download
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
        XLSX.writeFile(wb, `CHC_Schedule_${monthName}_${year}.xlsx`);
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('schedule-results').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('schedule-results').classList.add('hidden');
    }
}

// Initialize the scheduler when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CHCScheduler();
});
