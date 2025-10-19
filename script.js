class CHCScheduler {
    constructor() {
        this.providers = [];
        this.schedule = {};
        this.selectedMonth = null;
        this.holidays = this.initializeHolidays();
        this.dayRanking = this.initializeDayRanking();
        this.initializeEventListeners();
    }

    initializeHolidays() {
        return {
            'New Years': { month: 0, day: 1, fixed: true },
            'MLK Jr Day': { month: 0, day: 15, fixed: false, weekday: 1 }, // Third Monday of January
            'Presidents Day': { month: 1, day: 15, fixed: false, weekday: 1 }, // Third Monday of February
            'Memorial Day': { month: 4, day: 25, fixed: false, weekday: 1 }, // Last Monday of May
            'Independence Day': { month: 6, day: 4, fixed: true },
            'Labor Day': { month: 8, day: 1, fixed: false, weekday: 1 }, // First Monday of September
            'Thanksgiving': { month: 10, day: 22, fixed: false, weekday: 4 }, // Fourth Thursday of November
            'Day After Thanksgiving': { month: 10, day: 23, fixed: false, weekday: 5 }, // Day after Thanksgiving
            'Christmas Eve': { month: 11, day: 24, fixed: true },
            'Christmas Day': { month: 11, day: 25, fixed: true }
        };
    }

    initializeDayRanking() {
        // Day ranking for 3-provider priority: Monday, Tuesday, Friday, Wednesday, Thursday
        // Lower number = higher priority for 3 providers
        return {
            1: 1, // Monday - highest priority
            2: 2, // Tuesday - second priority
            5: 3, // Friday - third priority
            3: 4, // Wednesday - fourth priority
            4: 5, // Thursday - lowest priority
            6: 6, // Saturday - not ideal for 3 providers
            0: 7  // Sunday - clinic closed
        };
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
            // Check if it's an Excel serial date (large number like 45965)
            const numericValue = parseFloat(dateStr);
            if (!isNaN(numericValue) && numericValue > 1000 && numericValue < 100000) {
                // Convert Excel serial date to JavaScript Date
                // Excel's epoch is January 1, 1900, but Excel incorrectly treats 1900 as a leap year
                // So we use December 30, 1899 as the actual epoch
                const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
                const date = new Date(excelEpoch.getTime() + (numericValue * 24 * 60 * 60 * 1000));
                return isNaN(date.getTime()) ? null : date;
            }
            
            // Parse date more reliably by handling MM/DD/YYYY and MM/DD/YY formats explicitly
            const fourDigitYearMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            const twoDigitYearMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
            
            if (fourDigitYearMatch) {
                const month = parseInt(fourDigitYearMatch[1]) - 1; // Convert to 0-indexed
                const day = parseInt(fourDigitYearMatch[2]);
                const year = parseInt(fourDigitYearMatch[3]);
                const date = new Date(year, month, day);
                return isNaN(date.getTime()) ? null : date;
            } else if (twoDigitYearMatch) {
                const month = parseInt(twoDigitYearMatch[1]) - 1; // Convert to 0-indexed
                const day = parseInt(twoDigitYearMatch[2]);
                let year = parseInt(twoDigitYearMatch[3]);
                
                // Convert 2-digit year to 4-digit year
                // Assume years 00-30 are 2000-2030, years 31-99 are 1931-1999
                if (year <= 30) {
                    year += 2000;
                } else {
                    year += 1900;
                }
                
                const date = new Date(year, month, day);
                return isNaN(date.getTime()) ? null : date;
            } else {
                // Fallback to original parsing for other formats
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? null : date;
            }
        }).filter(d => d);
    }

    isHoliday(date) {
        const month = date.getMonth();
        const day = date.getDate();
        const year = date.getFullYear();
        const dayOfWeek = date.getDay();

        for (const [holidayName, holiday] of Object.entries(this.holidays)) {
            if (holiday.month === month) {
                if (holiday.fixed) {
                    if (holiday.day === day) {
                        return { isHoliday: true, name: holidayName };
                    }
                } else {
                    // Calculate floating holidays
                    const holidayWithName = { ...holiday, name: holidayName };
                    const holidayDate = this.calculateFloatingHoliday(year, month, holidayWithName);
                    if (holidayDate && holidayDate.getDate() === day) {
                        return { isHoliday: true, name: holidayName };
                    }
                }
            }
        }

        return { isHoliday: false, name: null };
    }

    calculateFloatingHoliday(year, month, holiday) {
        // We need to pass the holiday name as a parameter since it's not available in the holiday object
        const holidayName = holiday.name || holiday.holidayName;
        
        if (holidayName === 'MLK Jr Day') {
            // Third Monday of January
            return this.getNthWeekdayOfMonth(year, month, 1, 3);
        } else if (holidayName === 'Presidents Day') {
            // Third Monday of February
            return this.getNthWeekdayOfMonth(year, month, 1, 3);
        } else if (holidayName === 'Memorial Day') {
            // Last Monday of May
            return this.getLastWeekdayOfMonth(year, month, 1);
        } else if (holidayName === 'Labor Day') {
            // First Monday of September
            return this.getNthWeekdayOfMonth(year, month, 1, 1);
        } else if (holidayName === 'Thanksgiving') {
            // Fourth Thursday of November
            return this.getNthWeekdayOfMonth(year, month, 4, 4);
        } else if (holidayName === 'Day After Thanksgiving') {
            // Day after Thanksgiving (Friday)
            const thanksgiving = this.getNthWeekdayOfMonth(year, month, 4, 4);
            if (thanksgiving) {
                const dayAfter = new Date(thanksgiving);
                dayAfter.setDate(dayAfter.getDate() + 1);
                return dayAfter;
            }
        }
        
        return null;
    }

    getNthWeekdayOfMonth(year, month, targetWeekday, n) {
        const firstDay = new Date(year, month, 1);
        const firstWeekday = firstDay.getDay();
        
        // Calculate the first occurrence of the target weekday
        let daysToAdd = (targetWeekday - firstWeekday + 7) % 7;
        const firstOccurrence = new Date(year, month, 1 + daysToAdd);
        
        // Add (n-1) weeks to get the nth occurrence
        const nthOccurrence = new Date(firstOccurrence);
        nthOccurrence.setDate(firstOccurrence.getDate() + (n - 1) * 7);
        
        // Make sure we're still in the same month
        if (nthOccurrence.getMonth() === month) {
            return nthOccurrence;
        }
        
        return null;
    }

    getLastWeekdayOfMonth(year, month, targetWeekday) {
        const lastDay = new Date(year, month + 1, 0); // Last day of the month
        const lastWeekday = lastDay.getDay();
        
        // Calculate days to subtract to get to the last occurrence of target weekday
        let daysToSubtract = (lastWeekday - targetWeekday + 7) % 7;
        const lastOccurrence = new Date(lastDay);
        lastOccurrence.setDate(lastDay.getDate() - daysToSubtract);
        
        return lastOccurrence;
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

        // Initialize schedule structure (skip Sundays since clinic is closed)
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            
            // Skip Sundays - clinic is closed
            if (dayOfWeek === 0) continue;
            
            const holidayInfo = this.isHoliday(date);
            
            schedule[day] = {
                date: date,
                dayOfWeek: dayOfWeek,
                shifts: { open: [], mid: [], close: [] },
                isWeekend: dayOfWeek === 6, // Only Saturday is weekend now
                isHoliday: holidayInfo.isHoliday,
                holidayName: holidayInfo.name
            };
        }

        // Calculate total shifts needed (excluding holidays but counting them as paid shifts)
        const totalWeekdays = this.getWeekdaysInMonth(year, month);
        const totalSaturdays = this.getSaturdaysInMonth(year, month);
        const totalHolidays = this.getHolidaysInMonth(year, month);
        // Holidays count as paid shifts for ALL providers, so we add them to the total
        // Saturdays now only need 1 shift (mid) instead of 2
        const totalShifts = totalWeekdays * 3 + totalSaturdays * 1 + (totalHolidays * this.providers.length);

        // Distribute shifts among providers
        this.distributeShifts(schedule, totalShifts);

        this.schedule = schedule;
    }

    getWeekdaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let weekdays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dayOfWeek = new Date(year, month, day).getDay();
            // Count Monday-Friday only (exclude Sunday and Saturday)
            if (dayOfWeek >= 1 && dayOfWeek <= 5) weekdays++;
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

    getHolidaysInMonth(year, month) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let holidays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            
            // Skip Sundays - clinic is closed
            if (dayOfWeek === 0) continue;
            
            const holidayInfo = this.isHoliday(date);
            if (holidayInfo.isHoliday) {
                holidays++;
            }
        }
        return holidays;
    }

    distributeShifts(schedule, totalShifts) {
        // Create a working copy of providers with current assignments
        const workingProviders = this.providers.map(p => ({
            ...p,
            assignedDays: 0,
            assignedSaturdays: 0,
            assignedHolidays: 0,
            currentShifts: []
        }));

        // First, give ALL providers credit for holidays
        for (const day in schedule) {
            const dayData = schedule[day];
            const isHoliday = dayData.isHoliday;

            if (isHoliday) {
                // ALL providers get credit for holidays - no actual work but counts as a shift
                workingProviders.forEach(provider => {
                    provider.assignedDays++;
                    provider.assignedHolidays++;
                    provider.currentShifts.push({ day: parseInt(day), shiftType: 'holiday' });
                });
                // Mark this as a holiday for display purposes
                dayData.shifts.holiday = [dayData.holidayName];
            }
        }

        // Then distribute regular work shifts with day ranking consideration
        this.distributeShiftsWithRanking(schedule, workingProviders);
    }

    distributeShiftsWithRanking(schedule, workingProviders) {
        // Distribute shifts with day ranking consideration for 3-provider priority
        // Days are ranked: Monday, Tuesday, Friday, Wednesday, Thursday (in order of preference for 3 providers)
        
        // First, get all non-holiday days and sort by ranking
        const daysToSchedule = [];
        for (const day in schedule) {
            const dayData = schedule[day];
            if (!dayData.isHoliday) {
                daysToSchedule.push({
                    day: parseInt(day),
                    dayData: dayData,
                    ranking: this.dayRanking[dayData.dayOfWeek] || 999
                });
            }
        }
        
        // Sort by ranking (lower number = higher priority for 3 providers)
        daysToSchedule.sort((a, b) => a.ranking - b.ranking);
        
        // Distribute shifts for each day in ranking order
        for (const { day, dayData } of daysToSchedule) {
            const isSaturday = dayData.dayOfWeek === 6;
            const isThursday = dayData.dayOfWeek === 4;

            // Thursday: only mid shift, target 2 providers, allow 3 if needed, allow 1 if no other options
            if (isThursday) {
                this.assignThursdayShifts(workingProviders, dayData, day);
            }
            // Saturday: only 1 provider assigned to "mid" shift
            else if (isSaturday) {
                const provider = this.selectProviderForShift(workingProviders, dayData, 'mid', isSaturday);
                if (provider) {
                    dayData.shifts.mid.push(provider.name);
                    provider.assignedDays++;
                    provider.assignedSaturdays++;
                    provider.currentShifts.push({ day: day, shiftType: 'mid' });
                }
            } else {
                // Other weekdays: prioritize open and close shifts before mid shift
                this.assignWeekdayShifts(workingProviders, dayData, day);
            }
        }
    }

    assignThursdayShifts(workingProviders, dayData, day) {
        // Thursday constraints: only mid shift, target 2 providers, allow 3 if needed, allow 1 if no other options
        
        let assignedProviders = 0;
        
        // First, try to get 2 providers for Thursday mid shift (ideal case)
        for (let i = 0; i < 2; i++) {
            const provider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (provider) {
                dayData.shifts.mid.push(provider.name);
                provider.assignedDays++;
                provider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            } else {
                break; // No more available providers
            }
        }
        
        // If we got exactly 2 providers, we're done (ideal case)
        if (assignedProviders === 2) {
            return;
        }
        
        // If we got 0 or 1 providers, try to get 1 more if possible (up to 3 total)
        if (assignedProviders < 2) {
            const additionalProvider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (additionalProvider) {
                dayData.shifts.mid.push(additionalProvider.name);
                additionalProvider.assignedDays++;
                additionalProvider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            }
        }
        
        // If we still have 0 providers, try one more time with relaxed constraints
        if (assignedProviders === 0) {
            const fallbackProvider = this.selectProviderForThursdayFallback(workingProviders, dayData);
            if (fallbackProvider) {
                dayData.shifts.mid.push(fallbackProvider.name);
                fallbackProvider.assignedDays++;
                fallbackProvider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            }
        }
    }

    assignWeekdayShifts(workingProviders, dayData, day) {
        // Weekday constraints: prioritize open and close shifts before mid shift
        // Maximum 3 providers per day, with day ranking for 3-provider priority
        
        const maxProviders = 3;
        let assignedProviders = 0;
        
        // First, assign open shift (highest priority)
        const openProvider = this.selectProviderForShift(workingProviders, dayData, 'open', false);
        if (openProvider) {
            dayData.shifts.open.push(openProvider.name);
            openProvider.assignedDays++;
            openProvider.currentShifts.push({ day: day, shiftType: 'open' });
            assignedProviders++;
        }
        
        // Second, assign close shift (second priority)
        const closeProvider = this.selectProviderForShift(workingProviders, dayData, 'close', false);
        if (closeProvider) {
            dayData.shifts.close.push(closeProvider.name);
            closeProvider.assignedDays++;
            closeProvider.currentShifts.push({ day: day, shiftType: 'close' });
            assignedProviders++;
        }
        
        // Finally, assign mid shift (lowest priority) - only if we haven't reached max providers
        if (assignedProviders < maxProviders) {
            const midProvider = this.selectProviderForShift(workingProviders, dayData, 'mid', false);
            if (midProvider) {
                dayData.shifts.mid.push(midProvider.name);
                midProvider.assignedDays++;
                midProvider.currentShifts.push({ day: day, shiftType: 'mid' });
                assignedProviders++;
            }
        }
    }

    selectProviderForThursdayFallback(providers, dayData) {
        // Fallback method for Thursday when no providers meet normal criteria
        // This allows assigning providers even if they have preferred days off on Thursday
        
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO - use more robust date comparison
            const isOnPTO = p.ptoDates.some(ptoDate => {
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
            if (isOnPTO) return false;

            // For fallback, we'll ignore preferred days off on Thursday
            // Check Saturday limits (not applicable for Thursday)
            return true;
        });

        if (availableProviders.length === 0) return null;

        // Score providers - prefer those who haven't worked as much
        const scoredProviders = availableProviders.map(p => {
            let score = 0;

            // Prefer providers who haven't worked as much
            score += (10 - p.assignedDays) * 10;

            // Prefer shift preference match for mid shift
            const shiftPreferenceIndex = p.shiftPreferences.indexOf('mid');
            if (shiftPreferenceIndex !== -1) {
                score += (p.shiftPreferences.length - shiftPreferenceIndex) * 20;
            } else {
                score += Math.random() * 5;
            }

            // Random factor to break ties
            score += Math.random() * 10;

            return { provider: p, score };
        });

        // Sort by score and return the best provider
        scoredProviders.sort((a, b) => b.score - a.score);
        return scoredProviders[0].provider;
    }

    selectProviderForShift(providers, dayData, shiftType, isSaturday) {
        // Filter available providers
        const availableProviders = providers.filter(p => {
            // Check if already assigned today
            const assignedToday = p.currentShifts.some(s => s.day === dayData.date.getDate());
            if (assignedToday) return false;

            // Check PTO - use more robust date comparison
            const isOnPTO = p.ptoDates.some(ptoDate => {
                // Normalize both dates to midnight to avoid time component issues
                const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                const scheduleDateNormalized = new Date(dayData.date.getFullYear(), dayData.date.getMonth(), dayData.date.getDate());
                return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
            });
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


    generatePreferencesTable() {
        if (!this.providers || this.providers.length === 0) {
            return '<div class="preferences-table"><h3>Provider Preferences</h3><p>No provider data available</p></div>';
        }

        let html = '<div class="preferences-table">';
        html += '<h3>Provider Preferences Verification</h3>';
        html += '<p>Please verify that your input data was parsed correctly:</p>';
        html += '<table class="preferences"><thead><tr>';
        html += '<th>Name</th><th>Days/Week</th><th>Saturdays/Month</th><th>Preferred Days Off</th><th>Shift Preferences</th><th>PTO Dates</th>';
        html += '</tr></thead><tbody>';

        this.providers.forEach(provider => {
            html += '<tr>';
            html += `<td class="provider-name">${provider.name}</td>`;
            html += `<td>${provider.daysPerWeek}</td>`;
            html += `<td>${provider.saturdaysPerMonth}</td>`;
            
            // Format preferred days off
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const preferredDaysOff = provider.preferredDaysOff.map(dayNum => dayNames[dayNum]).join(', ');
            html += `<td>${preferredDaysOff || 'None'}</td>`;
            
            // Format shift preferences
            const shiftPrefs = provider.shiftPreferences.join(', ');
            html += `<td>${shiftPrefs}</td>`;
            
            // Format PTO dates
            const ptoDates = provider.ptoDates.map(date => {
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const year = date.getFullYear();
                return `${month}/${day}/${year}`;
            }).join(', ');
            html += `<td>${ptoDates || 'None'}</td>`;
            
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';
        
        return html;
    }

    displaySchedule() {
        const container = document.getElementById('calendar-container');
        const year = parseInt(this.selectedMonth.split('-')[0]);
        const month = parseInt(this.selectedMonth.split('-')[1]) - 1;

        let html = this.generatePreferencesTable();
        html += '<div class="schedule-separator"></div>';
        html += '<table class="calendar"><thead><tr>';
        html += '<th>Date</th><th>Day</th><th>Open</th><th>Mid</th><th>Close</th><th>Holiday</th><th>PTO Today</th></tr></thead><tbody>';

        for (const day in this.schedule) {
            const dayData = this.schedule[day];
            const dayNum = parseInt(day);
            const date = new Date(year, month, dayNum);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            html += '<tr>';
            html += `<td>${dayNum}</td>`;
            html += `<td class="${dayData.isWeekend ? 'weekend' : ''} ${dayData.isHoliday ? 'holiday' : ''}">${dayNames[dayData.dayOfWeek]}</td>`;
            
            // Display shifts
            const isSaturday = dayData.dayOfWeek === 6;
            const isThursday = dayData.dayOfWeek === 4;
            
            if (isThursday) {
                // Thursday: only show mid shift, hide open and close
                html += '<td class="thursday-off">-</td>'; // Open column
                const midProviders = dayData.shifts.mid || [];
                html += `<td class="thursday-mid">`;
                if (midProviders.length > 0) {
                    midProviders.forEach((provider, index) => {
                        const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                            ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                        );
                        if (index > 0) html += '<br>'; // Add line break for multiple providers
                        html += `<span class="shift mid ${isPTO ? 'pto' : ''}">${provider}</span>`;
                    });
                } else {
                    html += '<span class="shift off">OFF</span>';
                }
                html += '</td>';
                html += '<td class="thursday-off">-</td>'; // Close column
            } else if (isSaturday) {
                // Saturday: only show mid shift, hide open and close
                html += '<td class="saturday-off">-</td>'; // Open column
                const midProviders = dayData.shifts.mid || [];
                html += `<td>`;
                if (midProviders.length > 0) {
                    midProviders.forEach(provider => {
                        const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                            ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                        );
                        html += `<span class="shift mid ${isPTO ? 'pto' : ''}">${provider}</span>`;
                    });
                } else {
                    html += '<span class="shift off">OFF</span>';
                }
                html += '</td>';
                html += '<td class="saturday-off">-</td>'; // Close column
            } else {
                // Other weekdays: show all shifts
                ['open', 'mid', 'close'].forEach(shiftType => {
                    const providers = dayData.shifts[shiftType] || [];
                    html += `<td>`;
                    if (providers.length > 0) {
                        providers.forEach(provider => {
                            const isPTO = this.providers.find(p => p.name === provider)?.ptoDates.some(ptoDate => 
                                ptoDate.getDate() === dayNum && ptoDate.getMonth() === month && ptoDate.getFullYear() === year
                            );
                            html += `<span class="shift ${shiftType} ${isPTO ? 'pto' : ''}">${provider}</span>`;
                        });
                    } else {
                        html += '<span class="shift off">OFF</span>';
                    }
                    html += '</td>';
                });
            }
            
            // Display Holiday column
            html += '<td class="holiday-column">';
            if (dayData.isHoliday) {
                const holidayProvider = dayData.shifts.holiday ? dayData.shifts.holiday[0] : null;
                if (holidayProvider) {
                    html += `<span class="holiday-shift">${holidayProvider}</span>`;
                } else {
                    html += `<span class="holiday-name">${dayData.holidayName}</span>`;
                }
            } else {
                html += '<span class="no-holiday">-</span>';
            }
            html += '</td>';
            
            // Display PTO Today column
            html += '<td class="pto-column">';
            const ptoToday = this.providers.filter(provider => 
                provider.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(year, month, dayNum);
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                })
            );
            
            if (ptoToday.length > 0) {
                ptoToday.forEach((provider, index) => {
                    if (index > 0) html += ', ';
                    html += `<span class="pto-name">${provider.name}</span>`;
                });
            } else {
                html += '<span class="no-pto">-</span>';
            }
            html += '</td>';
            
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
        exportData.push(['Date', 'Day', 'Open', 'Mid', 'Close', 'Holiday', 'PTO Today']);

        for (const day in this.schedule) {
            const dayData = this.schedule[day];
            const dayNum = parseInt(day);
            const date = new Date(year, month, dayNum);
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            // Get PTO for this day
            const ptoToday = this.providers.filter(provider => 
                provider.ptoDates.some(ptoDate => {
                    const ptoDateNormalized = new Date(ptoDate.getFullYear(), ptoDate.getMonth(), ptoDate.getDate());
                    const scheduleDateNormalized = new Date(year, month, dayNum);
                    return ptoDateNormalized.getTime() === scheduleDateNormalized.getTime();
                })
            ).map(provider => provider.name).join(', ');
            
            // Get holiday information
            let holidayInfo = '-';
            if (dayData.isHoliday) {
                const holidayProvider = dayData.shifts.holiday ? dayData.shifts.holiday[0] : null;
                if (holidayProvider) {
                    holidayInfo = `${dayData.holidayName} (${holidayProvider})`;
                } else {
                    holidayInfo = dayData.holidayName;
                }
            }

            const isSaturday = dayData.dayOfWeek === 6;
            const isThursday = dayData.dayOfWeek === 4;
            const row = [
                `${monthName} ${dayNum}`,
                dayNames[dayData.dayOfWeek],
                (isSaturday || isThursday) ? '-' : (dayData.shifts.open || []).join(', '),
                (dayData.shifts.mid || []).join(', '),
                (isSaturday || isThursday) ? '-' : (dayData.shifts.close || []).join(', '),
                holidayInfo,
                ptoToday || '-'
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
