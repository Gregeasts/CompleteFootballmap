// Initialize the map and set its view to your chosen geographical coordinates and zoom level
const map = L.map('map').setView([50.2494, -4.9356], 10); // Adjust center and zoom

// Add a tile layer (e.g., OpenStreetMap tiles)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
let allMarkers = [];
let allAgeGroups = new Set(); // Store all unique age groups
let allGenderGroups = new Set(); // Store all unique age groups
let allDGroups = new Set(); 
let allGenderAgeGroups = new Set(); // Store all unique age groups
let selectedStarLevels = []; // Store selected star levels
let selectedAgeGroups = []; // Store selected age groups
let selectedGender = []; // Store selected age groups
let selectedD = []; // Store selected age groups
let selectedGenderAge = []; // Store selected age groups
let geojsonLayer;
let combinations;
let amount;
let percentofpop;
let meanTeamsPer50;
let stdDevTeamsPer50;
let starAmount;
// Load GeoJSON data
fetch('geojsondata.geojson')
    .then(response => response.json())
    .then(data => {
        console.log('Loaded GeoJSON:', data); // Check data structure in the console
        geojsonLayer = L.geoJSON(data, {
            style: feature => ({
                color: 'blue',
                weight: 2,
                fillColor: 'red',
                fillOpacity: 0.5
            }),
            onEachFeature: (feature, layer) => {
                if (feature.properties) {
                    const popupContent = `
                        <strong>PAR23CD:</strong> ${feature.properties.PAR23CD}<br />
                        <strong>Location Name:</strong> ${feature.properties.PAR23NM_x}
                    `;
                    layer.bindPopup(popupContent);
                }
            }
        });

        geojsonLayer.addTo(map);
        
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

// Define star level colors
const starColors = {
    0: 'grey',
    1: 'red',
    2: 'yellow',
    3: 'green'
};

// Create a new pane for markers
map.createPane('markerPane');
map.getPane('markerPane').style.zIndex = 650; // Higher than the default overlay pane (400)

// Load and process the teams_df1 (2).csv file
fetch('teams_df1 (2).csv')
    .then(response => response.text())
    .then(csvText => {
        // Parse CSV text into rows
        const rows = csvText.split('\n');
        const headers = rows[0].split(','); // Extract headers
        const dataRows = rows.slice(1); // Skip header row

        // Find the indexes of relevant columns
        const latitudeIndex = headers.indexOf('Latitude');
        const longitudeIndex = headers.indexOf('Longitude');
        const starLevelIndex = headers.indexOf('Star Level');
        const clubNameIndex = headers.indexOf('Club Name');
        const IDIndex = headers.indexOf('Club PFF ID');
        const par23cdIndex = headers.indexOf('PAR23CD'); // Find the par23cd column index

        if (latitudeIndex === -1 || longitudeIndex === -1 || starLevelIndex === -1 || IDIndex === -1) {
            console.error('Missing required columns in CSV.');
            return;
        }

        // Fetch the club_df.csv file (the second CSV containing detailed club data)
        fetch('club_df.csv')
            .then(response => response.text())
            .then(clubCsvText => {
                // Parse club_df.csv into rows
                const clubRows = clubCsvText.split('\n');
                const clubHeaders = clubRows[0].split(','); // Extract headers for club_df.csv
                const clubDataRows = clubRows.slice(1); // Skip header row

                // Find the index of the 'ID' column in club_df.csv
                const clubIDIndex = clubHeaders.indexOf('Club PFF ID');

                if (clubIDIndex === -1) {
                    console.error('Missing "ID" column in club_df.csv.');
                    return;
                }

                // Process each row in teams_df1 (2).csv
                dataRows.forEach(row => {
                    const columns = row.split(',');

                    // Extract relevant data from the teams_df1 (2).csv row
                    const latitude = parseFloat(columns[latitudeIndex]);
                    const longitude = parseFloat(columns[longitudeIndex]);
                    const starLevel = parseInt(columns[starLevelIndex], 10);
                    const clubName = columns[clubNameIndex];
                    const PAR23CD = columns[par23cdIndex];
                    

                    if (par23cdIndex === -1) {
                        console.error('Missing "par23cd" column in CSV.');
                        return;
                    }

                    
                    

                    // Skip invalid rows
                    if (isNaN(latitude) || isNaN(longitude) || isNaN(starLevel)) return;

                    // Now, let's use the Club PFF ID to find the corresponding data in club_df.csv
                    const clubPFFID = columns[IDIndex];

                    // Find matching rows in club_df.csv based on the Club PFF ID
                    const matchingClubRows = clubDataRows.filter(clubRow => {
                        const clubColumns = clubRow.split(',');
                        return clubColumns[clubIDIndex] === clubPFFID;
                    });
                    const ageGroups = [];
                    const Genders = [];
                    const GendersAge=[];
                    const D=[];



                    // Log the matched club data for each row in teams_df1 (2).csv
                    matchingClubRows.forEach(matchedRow => {
                        const matchedColumns = matchedRow.split(',');
                        ageGroups.push(matchedColumns[7]);
                        Genders.push(matchedColumns[9]);
                        D.push(matchedColumns[10]);
                        GendersAge.push(matchedColumns[7]+matchedColumns[9]+matchedColumns[10])

                        // Log relevant columns from the matched row in club_df.csv
                    
                    });
                    
                    allAgeGroups = new Set([...allAgeGroups, ...ageGroups]);
                    allGenderGroups = new Set([...allGenderGroups, ...Genders]);
                    allDGroups = new Set([...allDGroups, ...D]);
                    
                    allGenderAgeGroups = new Set([...allGenderAgeGroups, ...GendersAge]);
                    
                    

                    // Add marker to the map
                    const marker = L.circleMarker([latitude, longitude], {
                        pane: 'markerPane',
                        radius: 8,
                        
                        fillColor: starColors[starLevel] || 'black',
                        color: 'black',          // Set the border color to black
                        weight: 4,  
                        fillOpacity: 0.8
                    }).bindPopup(
                        `<strong>Club:</strong> ${clubName || 'Unknown'}<br>` 
                        
                    );

                    // Add to global markers array
                    marker.starLevel = starLevel;
                    marker.ageGroups = ageGroups;
                    marker.clubName = clubName;
                    marker.genders = Genders;
                    marker.gendersage = GendersAge;
                    marker.clubPFFID = clubPFFID;
                    marker.ddd=D;
                    marker.par23cd = PAR23CD;
                    allMarkers.push(marker);
                    marker.on('click', () => {
                        // Update the team information in the HTML
                        const teamInfo = matchingClubRows.map(matchedRow => {
                            const matchedColumns = matchedRow.split(',');

                            // Extract club and team info
                            const teamDetails = {
                                clubPFFID: matchedColumns[clubIDIndex],
                                teamPFFID: matchedColumns[5],
                                countyFA: matchedColumns[0],  // Example: assuming County FA is at column 0
                                region: matchedColumns[1],     // Example: assuming Region is at column 1
                                teamName: matchedColumns[3],   // Team Name
                                ageGroup: matchedColumns[7],   // Team Age Group
                                gender: matchedColumns[9],     // Team Gender
                                accreditationStatus: matchedColumns[16], // Accreditation Status
                                starLevel: matchedColumns[17], // Star Level
                                disability: matchedColumns[10],
                                // Add other team info as needed...
                            };

                            return teamDetails;
                        });

                        // Show club information
                        console.log(teamInfo)
                        document.getElementById('team-name').textContent = `Club Name: ${clubName || 'Unknown'}`;
                        document.getElementById('team-id').textContent = `Club PFF ID: ${clubPFFID}`;
                        
                        if (starLevel === 1) {
                            starAmount = "★";
                        } else if (starLevel === 2) {
                            starAmount = "★★";
                        } else if (starLevel === 3) {
                            starAmount = "★★★";
                        } else {
                            starAmount = "No Star Rating";
                        }
                        console.log(teamInfo[0].accreditationStatus, teamInfo[0].countyFA, teamInfo[0].region);
                        document.getElementById('team-star-level').textContent = `Star Level: ${starAmount}`;
                        document.getElementById('team-accreditation-status').textContent = `Accreditation Status: ${teamInfo[0].accreditationStatus}`;
                        document.getElementById('team-county').textContent = `County FA: ${teamInfo[0].countyFA}`;
                        document.getElementById('team-region').textContent = `Region: ${teamInfo[0].region}`;

                        // Show detailed team data
                        let teamDetailsHTML = '';
                        teamInfo.forEach(team => {
                            console.log(starLevel,selectedStarLevels,team.ageGroup,selectedAgeGroups,team.gender,selectedGender,selectedD ,team.disability)
                            if (
                                (selectedStarLevels.length === 0 || selectedStarLevels.includes(starLevel) || selectedStarLevels === "-1") &&
                                (selectedAgeGroups.length === 0 || selectedAgeGroups.includes(team.ageGroup) || selectedAgeGroups === "") &&
                                (selectedGender.length === 0 || selectedGender.includes(team.gender) || selectedGender === "") &&
                                (selectedD.length === 0 || selectedD.includes(team.disability) || selectedD === "")
                            ) {
                                teamDetailsHTML += `
                                    
                                    <div class="maincontent-container">
                                        <div class="maincontent1">
                                            <div class="team-name">${team.teamName}</div>
                                            <strong>Team Age Group:</strong> ${team.ageGroup}<br>
                                            <strong>Team Gender:</strong> ${team.gender}<br>
                                            <strong>Team Disability:</strong> ${team.disability}<br>

                                            <strong>Accreditation Status:</strong> ${team.accreditationStatus}<br>
                                            <strong>Star Level:</strong> ${team.starLevel}<br>
                                            <!-- Add more fields here -->
                                        </div>
                                    </div>`;
                            }
                            
                        });

                        // Insert team details into HTML
                        document.getElementById('team-details').innerHTML = teamDetailsHTML;
                    });

                    // Add to the map initially
                    marker.addTo(map);
                });

                createAgeGroupCheckboxes();
                createGenderGroupCheckboxes();
                createDGroupCheckboxes();

            })
            .catch(error => console.error('Error loading club_df.csv:', error));

    })
    .catch(error => console.error('Error loading teams_df1 (2).csv:', error));


// Event listener for the filter dropdown (Star Level)
document.getElementById('star-filter').addEventListener('change', () => {
    const selectedOptions = Array.from(document.getElementById('star-filter').selectedOptions);
    if (selectedOptions.length === 0 || selectedOptions[0].value === "-1") {
        selectedStarLevels = [];  // "All" selected: no star level filter
    } else {
        selectedStarLevels = selectedOptions.map(option => parseInt(option.value, 10));
    }
    
    // Update the map with the filtered markers
    applyFilters();
});
function createAgeGroupCheckboxes() {
    const container = document.getElementById('age-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allAgeGroups.size === 0) {
        container.textContent = 'No age groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allAgeGroups.forEach(ageGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `age-group-${ageGroup}`;
        checkbox.value = ageGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedAgeGroups = Array.from(document.querySelectorAll('#age-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `age-group-${ageGroup}`;
        label.textContent = ageGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}
function createGenderGroupCheckboxes() {
    const container = document.getElementById('gender-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allGenderGroups.size === 0) {
        container.textContent = 'No gender groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allGenderGroups.forEach(genderGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `gender-group-${genderGroup}`;
        checkbox.value = genderGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedGender = Array.from(document.querySelectorAll('#gender-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `gender-group-${genderGroup}`;
        label.textContent = genderGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}
function createDGroupCheckboxes() {
    const container = document.getElementById('D-group-checkboxes');

    // Clear any existing checkboxes to avoid duplicates
    container.innerHTML = '';

    if (allDGroups.size === 0) {
        container.textContent = 'No gender groups found in data.';
        return;
    }

    // Loop through all unique age groups and create checkboxes
    allDGroups.forEach(DGroup => {
        // Create checkbox input
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `D-group-${DGroup}`;
        checkbox.value = DGroup;

        // Add event listener to apply filters when checked/unchecked
        checkbox.addEventListener('change', () => {
            // Update the selected age groups list
            selectedD = Array.from(document.querySelectorAll('#D-group-checkboxes input:checked')).map(
                checkbox => checkbox.value
            );

            // Apply filters after selection
            applyFilters();
        });

        // Create label for the checkbox
        const label = document.createElement('label');
        label.htmlFor = `D-group-${DGroup}`;
        label.textContent = DGroup;

        // Append checkbox and label to the container
        container.appendChild(checkbox);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });
}

function logSelectedFilters() {
    // Get all checked age group checkboxes' ids
    const selectedAgeGroupIds = Array.from(document.querySelectorAll('#age-group-checkboxes input:checked'))
                                      .map(checkbox => checkbox.value);

    // Get all checked gender group checkboxes' ids
    const selectedGenderGroupIds = Array.from(document.querySelectorAll('#gender-group-checkboxes input:checked'))
                                         .map(checkbox => checkbox.value);
    const selectedDGroupIds = Array.from(document.querySelectorAll('#D-group-checkboxes input:checked'))
                                         .map(checkbox => checkbox.value);

    const combinations = [];

        // Create combinations of age group and gender group ids
    const hasAgeGroups = selectedAgeGroupIds.length > 0;
    const hasGenderGroups = selectedGenderGroupIds.length > 0;
    const hasDisabilityGroups = selectedDGroupIds.length > 0;

    if (hasAgeGroups && hasGenderGroups && hasDisabilityGroups) {
        // If all three contain items, perform the original loop for all combinations
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                selectedDGroupIds.forEach(DGroupId => {
                    // Combine the ids of age group, gender group, and disability group
                    const combination = ageGroupId + genderGroupId + DGroupId;
                    combinations.push(combination);

                    
                });
            });
        });
    } else if (hasAgeGroups && hasGenderGroups) {
        // If only Age and Gender groups contain values
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    ageGroupId + genderGroupId + "NonDisability",
                    ageGroupId + genderGroupId + "PanDisability",
                    ageGroupId + genderGroupId + "Wheelchair",
                );
            });
        });
    }else if (hasAgeGroups && hasDisabilityGroups) {
        // If only Age and Gender groups contain values
        selectedAgeGroupIds.forEach(ageGroupId => {
            selectedDGroupIds.forEach(DGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    ageGroupId + "Mixed" + DGroupId,
                    ageGroupId + "Female" + DGroupId,
                    ageGroupId + "Male" + DGroupId,
                );
            });
        });
    }else if (hasGenderGroups && hasDisabilityGroups) {
        // If only Age and Gender groups contain values
        selectedDGroupIds.forEach(DGroupId => {
            selectedGenderGroupIds.forEach(genderGroupId => {
                // Create combinations for Age and Gender only
                combinations.push(
                    "U5" + genderGroupId + DGroupId,
                    "U6" + genderGroupId + DGroupId,
                    "U7" + genderGroupId + DGroupId,
                    "U8" + genderGroupId + DGroupId,
                    "U9" + genderGroupId + DGroupId,
                    "U10" + genderGroupId + DGroupId,
                    "U11" + genderGroupId + DGroupId,
                    "U12" + genderGroupId + DGroupId,
                    "U13" + genderGroupId + DGroupId,
                    "U14" + genderGroupId + DGroupId,
                    "U15" + genderGroupId + DGroupId,
                    "U16" + genderGroupId + DGroupId,
                    "U17" + genderGroupId + DGroupId,
                    "U8" + genderGroupId + DGroupId,
                    "Open" + genderGroupId + DGroupId,
                    "Veterans" + genderGroupId + DGroupId,

                );
            });
        });
    }
    
                
    
    return combinations;
}


// Function to filter markers based on both age groups and star levels
function applyFilters() {
    // Remove all markers from the map
    allMarkers.forEach(marker => map.removeLayer(marker));
    combinations=logSelectedFilters()
    

    // Add markers that match both selected age groups and star levels
    allMarkers
        .filter(marker => 
            (selectedStarLevels.length === 0 || selectedStarLevels.includes(marker.starLevel)) &&
            (selectedAgeGroups.length === 0 || marker.ageGroups.some(group => selectedAgeGroups.includes(group))) &&
            (selectedGender.length === 0 || marker.genders.some(group => selectedGender.includes(group))) &&
            (combinations.length === 0 || marker.gendersage.some(group => combinations.includes(group))) &&
            (selectedD.length === 0 || marker.ddd.some(group => selectedD.includes(group)))
            
            
        )
        .forEach(marker => marker.addTo(map));
        updateGeoJSONLayer();
}

function countClubsByPar23cd() {
    const counts = {};

    allMarkers
        .filter(marker => 
            (selectedStarLevels.length === 0 || selectedStarLevels.includes(marker.starLevel)) &&
            (selectedAgeGroups.length === 0 || marker.ageGroups.some(group => selectedAgeGroups.includes(group))) &&
            (selectedGender.length === 0 || marker.genders.some(group => selectedGender.includes(group))) &&
            (logSelectedFilters().length === 0 || marker.gendersage.some(group => logSelectedFilters().includes(group))) &&
            

            (selectedD.length === 0 || marker.ddd.some(group => selectedD.includes(group)))
        )

        
        .forEach(marker => {
            
            if (logSelectedFilters().length!==0){
                amount = marker.gendersage.filter(group => logSelectedFilters().includes(group)).length;
            }
            if (selectedAgeGroups.length !==0 && selectedStarLevels.length===0 && selectedGender.length===0 && selectedD.length===0 && logSelectedFilters().length===0){
                
                amount = marker.ageGroups.filter(group => selectedAgeGroups.includes(group)).length;
                
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length!==0 && selectedGender.length===0 && selectedD.length===0 && logSelectedFilters().length===0){
                if (selectedStarLevels.includes(marker.starLevel)){
                    amount = marker.genders.length;
                }
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length===0 && selectedGender.length!==0 && selectedD.length===0 && logSelectedFilters().length===0){
                amount = marker.genders.filter(group => selectedGender.includes(group)).length;
            }
            if (selectedAgeGroups.length ===0 && selectedStarLevels.length===0 && selectedGender.length===0 && selectedD.length!==0 && logSelectedFilters().length===0){
                amount = marker.ddd.filter(group => selectedD.includes(group)).length;
            }
            if (!counts[marker.par23cd]) counts[marker.par23cd] = 0;
            counts[marker.par23cd]+=amount;
        });
        

    return counts;
}
function findpercentofpop(){
    let scalarg = 0;
    let scalara = 0;
    let scalard = 0;

    // Calculate scalarg based on gender
    selectedGender.forEach(gender => {
        if (gender === "Male" || gender === "Female") {
            scalarg += 0.5; // Add 0.5 for each Male or Female
        } else {
            scalarg = 1; // Add 1 for other gender categories
        }
    });

    if (scalarg ===0){
        scalarg=1
    }
    // Calculate scalara based on age groups
    selectedAgeGroups.forEach(ageGroup => {
        switch (ageGroup) {
            case "U5":
            case "U6":
            case "U7":
            case "U8":
            case "U9":
            case "U10":
            case "U11":
            case "U12":
            case "U13":
            case "U14":
            case "U15":
            case "U16":
                scalara += 0.0125; // Add 0.0125 for each U5-U16 group
                break;
            case "U18":
                scalara += 0.025; // Add 0.025 for U18
                break;
            case "Open":
            case "Veteran":
                scalara += 0.2875; // Add 0.2875 for Open or Veteran
                break;
        }
    });
    if (scalara ===0){
        scalara=1
    }

    // Calculate scalard based on disability categories
    selectedD.forEach(disability => {
        if (disability === "PanDisability") {
            scalard += 0.005; // Add 0.05 for PanDisability
        } else if (disability === "Wheelchair") {
            scalard += 0.0025; // Add 0.025 for Wheelchair
        } else if (disability === "NonDisability") {
            scalard = 1; // Add 0.025 for Wheelchair
        }

    });
    if (scalard ===0){
        scalard=1
    }
    // Calculate the total percentage
    
    const totalPercent = scalara * scalarg * scalard;
    return totalPercent;
}
function findmeanandstd(clubCount,percentofpop){
    let teamsPer50List = [];
    geojsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
            const par23cd = layer.feature.properties.PAR23CD;
            const population = layer.feature.properties.pop_7;  // Assuming pop_7 holds the population data

            // Calculate the target population adjusted by percentofpop
            const targetPop = (population / 0.00625) * percentofpop;

            // Get the number of teams for the current par23cd from clubCount
            const numberOfTeams = clubCount[par23cd] || 0;  // Default to 0 if no teams found

            // Calculate teams per 50
            const teamsPer50 = (numberOfTeams / targetPop) * 50;

            // Store the teamsPer50 value
            teamsPer50List.push(teamsPer50);
        }
    });
    const mean = teamsPer50List.reduce((sum, value) => sum + value, 0) / teamsPer50List.length;

    // Calculate standard deviation
    const variance = teamsPer50List.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / teamsPer50List.length;
    const stdDev = Math.sqrt(variance);
    return {mean, stdDev};

}

function updateGeoJSONLayer() {
    if (!geojsonLayer) {
        console.error('GeoJSON layer is not initialized.');
        return;
    }
    clubCount=countClubsByPar23cd();
    percentofpop = findpercentofpop();
    ({ mean: meanTeamsPer50, stdDev: stdDevTeamsPer50 } = findmeanandstd(clubCount, percentofpop));
    console.log(meanTeamsPer50);
    geojsonLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
            
            const par23cd = layer.feature.properties.PAR23CD;
            
            const targetpop = ((layer.feature.properties.pop_7)/0.00625)*percentofpop;
            
            // Perform filtering and styling
            
            const countForCurrentPar23cd = clubCount[par23cd] || 0; // Default to 0 if not found

            teamsper50= (countForCurrentPar23cd/targetpop)*50;
            
            
            console.log((layer.feature.properties.pop_7)/0.00625,percentofpop,countForCurrentPar23cd,targetpop,teamsper50)

            layer.setStyle({
                fillColor: getColorBasedOnTeamsPer50(teamsper50, meanTeamsPer50,stdDevTeamsPer50),
                fillOpacity: 1,
                color: 'blue',
                weight: 2
            });
            const popupContent = `
                <strong>PAR23CD:</strong> ${layer.feature.properties.PAR23CD}<br />
                <strong>Location Name:</strong> ${layer.feature.properties.PAR23NM_x}<br />
                <strong>Population After Filtering:</strong> ${targetpop.toFixed(2)}<br />
                <strong>Teams Per 50:</strong> ${teamsper50.toFixed(2)}
            `;
            layer.bindPopup(popupContent);
        }
    });
}
function getColorBasedOnTeamsPer50(teamsPer50, meanTeamsPer50, stdDevTeamsPer50) {
    // Normalize the teamsPer50 value based on the mean and standard deviation
    // Here, we want to scale based on the spread, using (value - mean) / stdDev
    
    let normalizedValue = (teamsPer50 - meanTeamsPer50) / stdDevTeamsPer50;
    
    // Clamp the normalized value to avoid extreme values (for example, values < -3 or > 3)
    normalizedValue = Math.max(-3, Math.min(3, normalizedValue));
    
    // Interpolate between colors (red for low values, yellow for mid values, and green for high values)
    const r = Math.round(255 * Math.max(0, 1 - Math.abs(normalizedValue)));
    const g = Math.round(255 * Math.max(0, Math.min(1, normalizedValue)));
    const b = 0; // Blue remains 0 for the red-to-green gradient
    
    // Return the color in RGB format
    return `rgb(${r}, ${g}, ${b})`;
}
