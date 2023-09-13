/* global window, $, jQuery, _, Pbf, FeedMessage, alert, accessibleAutocomplete,  */
/* eslint no-var: "off", no-unused-vars: "off", no-alert: "off" */

function setupTransitDeparturesWidget(routes, stops, config) {
  let departuresResponse
  let departuresTimeout
  let initialStop
  let selectedParameters

  function updateUrlWithStop(stop) {
    const url = new URL(window.location.origin + window.location.pathname)
    url.searchParams.append('stop', stop.stop_code || stop.stop_id)

    window.history.pushState(null, null, url)
  }

  async function fetchTripUpdates() {
    const url = `${config.gtfsRtTripupdatesUrl}?cacheBust=${Date.now()}`
    const response = await fetch(url)
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer()
      const pbf = new Pbf(new Uint8Array(bufferResponse))
      const object = FeedMessage.read(pbf)

      return object.entity
    }

    throw new Error(response.status)
  }

  function formatMinutes(seconds) {
    if (seconds < 60) {
      return '&#60;1'
    }

    return Math.floor(seconds / 60)
  }

  function formatDirectionId(directionId) {
    if (directionId === null) {
      return '0'
    }

    return directionId?.toString()
  }

  function timeStamp() {
    const now = new Date()
    let hours = now.getHours()
    let minutes = now.getMinutes()

    if (minutes < 10) {
      minutes = '0' + minutes
    }

    if (config.timeFormat === '24hour') {
      return `${hours}:${minutes}`
    }

    const suffix = hours < 12 ? 'AM' : 'PM'
    hours = hours < 12 ? hours : hours - 12
    hours = hours || 12

    return `${hours}:${minutes} ${suffix}`
  }

  jQuery(($) => {
    // Populate dropdown with all routes
    $('#departure_route').append(
      routes.map((route) => {
        return $('<option>')
          .attr('value', route.route_id)
          .text(route.route_full_name)
      }),
    )

    // Read URL parameters on load
    readUrlWithParameters()

    function readUrlWithParameters() {
      const url = new URL(window.location.href)
      const stopFromURL = url.searchParams.get('stop')

      if (!stopFromURL) {
        return
      }

      const stop = stops.find(
        (stop) =>
          stop.stop_id === stopFromURL || stop.stop_code === stopFromURL,
      )

      if (!stop) {
        return
      }

      initialStop = stop.stop_code || stop.stop_name

      // Wait for bootstrap js to initialize before triggering click
      setTimeout(() => {
        $('#stop_form').trigger('submit')
        $(
          '#real_time_departures input[name="departure_type"][value="stop"]',
        ).trigger('click')
      }, 100)
    }

    function resetResults() {
      if (departuresTimeout) {
        clearTimeout(departuresTimeout)
      }

      $('#departure_results').hide()
    }

    function showLoading() {
      $('#loading').show()
    }

    function hideLoading() {
      $('#loading').hide()
    }

    function renderStopInfo(selectedStops) {
      if (selectedStops && selectedStops.length > 0) {
        $('#departure_results .departure-results-stop-unknown').hide()
        $('#departure_results .departure-results-stop')
          .text(selectedStops[0].stop_name)
          .show()
      } else {
        $('#departure_results .departure-results-stop').hide()
        $('#departure_results .departure-results-stop-unknown').show()
      }

      if (
        selectedStops &&
        selectedStops.length === 1 &&
        selectedStops[0].stop_code &&
        !selectedStops[0].is_parent_station
      ) {
        $('#departure_results .departure-results-stop-code').text(
          selectedStops[0].stop_code,
        )
        $('#departure_results .departure-results-stop-code-container').show()
      } else {
        $('#departure_results .departure-results-stop-code-container').hide()
      }

      $('#departure_results .departure-results-fetchtime-time').text(
        timeStamp(),
      )
    }

    function formatDepartureGroup(departureGroup) {
      const div = $('<div>').addClass('departure-result')
      const { route, direction } = departureGroup[0]

      const routeNameDiv = $('<div>')
        .addClass('departure-result-route-name')
        .appendTo(div)
      const departureTimesDiv = $('<div>')
        .addClass('departure-result-times')
        .appendTo(div)

      if (route.route_short_name) {
        const routeColor = route.route_color ? `#${route.route_color}` : '#ccc'
        const routeTextColor = route.route_text_color
          ? `#${route.route_text_color}`
          : '#000'
        $('<div>')
          .text(route.route_short_name)
          .addClass('departure-result-route-circle')
          .css({
            'background-color': routeColor,
            color: routeTextColor,
          })
          .appendTo(routeNameDiv)
      }

      $('<div>')
        .text(direction.direction)
        .addClass('departure-result-route-direction')
        .appendTo(routeNameDiv)

      const sortedDepartures = _.take(
        _.sortBy(departureGroup, (departure) => departure.time),
        3,
      )

      for (const departure of sortedDepartures) {
        const minutes = formatMinutes(departure.time - Date.now() / 1000)
        const minutesLabel = $(
          '#departure_results .departure-results-container',
        ).data('minutes-label')

        $('<div>')
          .addClass('departure-result-time-container')
          .append(
            $('<div>')
              .addClass('departure-result-time')
              .html(
                `${minutes}<span class="departure-result-time-label">${minutesLabel}</span>`,
              ),
          )
          .appendTo(departureTimesDiv)
      }

      return div
    }

    function renderResults(selectedStops, departures) {
      renderStopInfo(selectedStops)

      if (departures.length === 0) {
        $('#departure_results .departure-results-container').hide()
        $('#departure_results .departure-results-error').hide()
        $('#departure_results .departure-results-none').show()
      } else {
        const departureGroups = _.groupBy(
          departures,
          (departure) =>
            `${departure.route.route_id}||${departure.direction.direction_id}`,
        )
        const sortedDepartureGroups = _.sortBy(
          departureGroups,
          (departureGroup) => {
            const { route } = departureGroup[0]
            return Number.parseInt(route.route_short_name, 10)
          },
        )
        $('#departure_results .departure-results-none').hide()
        $('#departure_results .departure-results-error').hide()
        $('#departure_results .departure-results-container')
          .html(
            sortedDepartureGroups.map((departureGroup) =>
              formatDepartureGroup(departureGroup),
            ),
          )
          .show()
      }

      hideLoading()
      $('#departure_results').show()
    }

    function renderError(selectedStops) {
      renderStopInfo(selectedStops)
      $('#departure_results .departure-results-error').show()

      hideLoading()
      $('#departure_results').show()
    }

    function findStops(stopId, stopName) {
      let selectedStops
      if (stopId !== undefined) {
        const selectedStop = stops.find((stop) => stop.stop_id === stopId)

        if (selectedStop) {
          selectedStops = [selectedStop]
        }
      } else {
        selectedStops = stops.filter(
          (stop) =>
            stop.stop_id === stopName ||
            stop.stop_code === stopName ||
            stop.stop_name === stopName,
        )
      }

      if (selectedStops) {
        // Use parent stop if it exists
        for (const stop of selectedStops) {
          if (stop.parent_station !== null) {
            const parentStationStop = stops.find(
              (s) => s.stop_id === stop.parent_station,
            )
            if (parentStationStop) {
              return [parentStationStop]
            }
          }
        }

        return selectedStops
      }

      // No stops found
      return undefined
    }

    function selectParameters({ stopId, stopName, directionId, routeId }) {
      $('.stop-code-invalid').hide()
      const selectedStops = findStops(stopId, stopName)
      const route = routes.find((route) => route.route_id === routeId)
      const direction = route
        ? route.directions.find(
            (direction) =>
              formatDirectionId(direction.direction_id) === directionId,
          )
        : undefined

      if (!selectedStops || selectedStops.length === 0) {
        $('.stop-code-invalid').show()
        return
      }

      selectedParameters = { selectedStops, direction, route }

      resetResults()
      showLoading()
      updateDepartures()

      // Every refresh interval seconds, check for tripupdates
      departuresTimeout = setInterval(
        () => updateDepartures(),
        config.refreshIntervalSeconds * 1000,
      )
    }

    function getRouteAndDirectionFromTrip(tripId) {
      let tripRoute
      let tripDirection
      for (const route of routes) {
        for (const direction of route.directions) {
          if (direction.tripIds.includes(tripId)) {
            tripDirection = direction
            tripRoute = route
            break
          }
        }

        if (tripDirection && tripRoute) {
          break
        }
      }

      return {
        route: tripRoute,
        direction: tripDirection,
      }
    }

    function filterDepartures(departures, { selectedStops, direction, route }) {
      // Remove departure information for last stoptime by stop_sequence if it has any
      const cleanedDepartures = departures.map((departure) => {
        const stopTimeUpdates = departure?.trip_update?.stop_time_update

        if (stopTimeUpdates && stopTimeUpdates.length >= 2) {
          delete stopTimeUpdates[0].arrival
          delete stopTimeUpdates[stopTimeUpdates.length - 1].departure
        }

        return departure
      })

      const selectedStopIds = selectedStops.flatMap((stop) => {
        return stop.is_parent_station
          ? stops
              .filter((s) => s.parent_station === stop.stop_id)
              .map((stop) => stop.stop_id)
          : [stop.stop_id]
      })
      const filteredDepartures = []

      for (const departure of cleanedDepartures) {
        let filteredDeparture = {}

        if (route) {
          if (
            !departure ||
            !departure.trip_update ||
            !departure.trip_update.trip
          ) {
            continue
          }

          if (
            !direction ||
            !direction.tripIds.includes(departure.trip_update.trip.trip_id)
          ) {
            continue
          }

          filteredDeparture.route = route
          filteredDeparture.direction = direction
        } else if (selectedStops && selectedStops.length > 0) {
          if (
            !departure ||
            !departure.trip_update ||
            !departure.trip_update.stop_time_update
          ) {
            continue
          }

          // Get route and direction from trip_id
          filteredDeparture = getRouteAndDirectionFromTrip(
            departure.trip_update.trip.trip_id,
          )
        }

        const stoptime = departure.trip_update.stop_time_update.find(
          (stopTimeUpdate) => selectedStopIds.includes(stopTimeUpdate.stop_id),
        )

        if (!stoptime || (!stoptime.arrival && !stoptime.departure)) {
          continue
        }

        filteredDeparture.time =
          stoptime.departure?.time ?? stoptime.arrival?.time

        // Hide departures more than 90 minutes in the future
        if (filteredDeparture.time - Date.now() / 1000 > 90 * 60) {
          continue
        }

        // Hide departures more than 1 minute in the past
        if (filteredDeparture.time - Date.now() / 1000 < -60) {
          continue
        }

        filteredDepartures.push(filteredDeparture)
      }

      return filteredDepartures
    }

    async function updateDepartures(forceRefresh) {
      try {
        const { selectedStops, direction, route } = selectedParameters
        // Use existing data if less than the refresh interval seconds old
        const minimumAge = Date.now() - config.refreshIntervalSeconds * 1000
        if (
          !departuresResponse ||
          departuresResponse.timestamp < minimumAge ||
          forceRefresh === true
        ) {
          const departures = await fetchTripUpdates()

          // Don't use new departure info if nothing is returned
          if (!departures) {
            console.error('No departures returned')
            return
          }

          departuresResponse = { departures, timestamp: Date.now() }
        }

        renderResults(
          selectedStops,
          filterDepartures(departuresResponse.departures, {
            selectedStops,
            direction,
            route,
          }),
        )

        if (selectedStops && selectedStops.length > 0) {
          updateUrlWithStop(selectedStops[0])
        }
      } catch (error) {
        console.error(error)
        renderError(selectedParameters?.selectedStops)
      }
    }

    $('#real_time_departures input[name="departure_type"]').change((event) => {
      const type = $(event.target).val()

      $('#real_time_departures #route_form').toggleClass(
        'hidden-form',
        type !== 'route',
      )
      $('#real_time_departures #stop_form').toggleClass(
        'hidden-form',
        type !== 'stop',
      )

      $('#real_time_departures #departure_stop').val('').prop('disabled', true)

      $('#real_time_departures #departure_direction option:gt(0)').remove()
      $('#real_time_departures #departure_stop option:gt(0)').remove()
      resetResults()
    })

    $('#real_time_departures #departure_route').change((event) => {
      const routeId = $(event.target).val()

      $('#real_time_departures #departure_stop').val('').prop('disabled', true)

      $('#real_time_departures #departure_direction option:gt(0)').remove()
      $('#real_time_departures #departure_stop option:gt(0)').remove()
      resetResults()

      if (routeId === '') {
        $('#real_time_departures #departure_direction')
          .val('')
          .prop('disabled', true)
      } else {
        $('#real_time_departures #departure_direction')
          .val('')
          .prop('disabled', false)

        const route = routes.find((route) => route.route_id === routeId)

        if (!route) {
          return console.warn(`Unable to find route ${routeId}`)
        }

        $('#real_time_departures #departure_direction').append(
          route.directions.map((direction) =>
            $('<option>')
              .val(formatDirectionId(direction.direction_id))
              .text(direction.direction),
          ),
        )

        if (route.directions.length === 1) {
          $('#real_time_departures #departure_direction').hide()
          $('#real_time_departures #departure_direction').val(
            formatDirectionId(route.directions[0].direction_id),
          )
          $('#real_time_departures #departure_direction').trigger('change')
        } else {
          $('#real_time_departures #departure_direction').show()
        }
      }
    })

    $('#real_time_departures #departure_direction').change((event) => {
      const routeId = $('#real_time_departures #departure_route').val()
      const directionId = $(event.target).val()

      $('#real_time_departures #departure_stop option:gt(0)').remove()
      resetResults()

      if (directionId === '') {
        $('#real_time_departures #departure_stop')
          .val('')
          .prop('disabled', true)
      } else {
        $('#real_time_departures #departure_stop')
          .val('')
          .prop('disabled', false)

        const route = routes.find((route) => route.route_id === routeId)

        if (!route) {
          return console.warn(`Unable to find route ${routeId}`)
        }

        const direction = route.directions.find(
          (direction) =>
            formatDirectionId(direction.direction_id) === directionId,
        )

        $('#real_time_departures #departure_stop').append(
          direction.stopIds.map((stopId) => {
            const stop = stops.find((stop) => stop.stop_id === stopId)
            return $('<option>').val(stop.stop_id).text(stop.stop_name)
          }),
        )
      }
    })

    $('#real_time_departures #departure_stop').change((event) => {
      const routeId = $('#real_time_departures #departure_route').val()
      const directionId = $('#real_time_departures #departure_direction').val()
      const stopId = $(event.target).val()

      selectParameters({
        stopId,
        routeId,
        directionId,
      })
    })

    $('#stop_form').submit((event) => {
      event.preventDefault()
      $('.stop-code-invalid').hide()

      const stopName = $('#departure_stop_code').val()

      if (stopName === '') {
        $('.stop-code-invalid').show()
        return
      }

      selectParameters({
        stopName,
      })
    })

    $('#departure_results .departure-results-fetchtime').click((event) => {
      event.preventDefault()
      resetResults()
      showLoading()
      updateDepartures(true)
    })

    accessibleAutocomplete({
      element: $('#departure_stop_code_container').get(0),
      id: 'departure_stop_code',
      source(query, populateResults) {
        const filteredResults = stops.filter((stop) => {
          // Don't list child stations
          if (stop.parent_station !== null) {
            return false
          }

          if (stop.stop_code?.startsWith(query.trim())) {
            return true
          }

          return stop.stop_name?.toLowerCase().includes(query.toLowerCase())
        })
        const sortedResults = _.sortBy(filteredResults, (stop) =>
          stop.stop_name?.toLowerCase().startsWith(query.toLowerCase().trim())
            ? 0
            : 1,
        )
        populateResults(sortedResults)
      },
      minLength: 2,
      autoselect: true,
      placeholder: $('#departure_stop_code_container').data('placeholder'),
      showNoOptionsFound: false,
      templates: {
        inputValue: (result) =>
          result && (result.stop_code || result.stop_name),
        suggestion(result) {
          if (!result) {
            return
          }

          if (typeof result === 'string') {
            return result
          }

          const stopCode = result.is_parent_station
            ? $('#departure_stop_code_container').data('stop-code-all')
            : result.stop_code

          let formattedStopName = `<strong>${result.stop_name}</strong>`

          if (stopCode) {
            formattedStopName += ` (${stopCode})`
          }

          return formattedStopName
        },
      },
      onConfirm(selectedStop) {
        if (!selectedStop) {
          return
        }

        $('#departure_stop_code').val(
          selectedStop.stop_code || selectedStop.stop_name,
        )
        $('#stop_form').trigger('submit')
      },
      defaultValue: initialStop,
    })
  })
}
